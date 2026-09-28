"""Designed infographic: the verified, released infographic drawn by a text-capable image model, then read back.

An image model that draws text can misspell a word or invent a figure, and nothing in a picture is
traceable on its own. So the designed version is held to the same bar as the structured one:
  * the prompt carries ONLY the released text (security policy already applied) and tells the model to
    render those strings exactly and nothing else;
  * the rendered image is read back by a vision model, and every line must be found again, and every number
    in the image must be one that appears in the verified content;
  * a render that fails read-back is retried once; if it still fails, it is kept but marked for review and
    the mismatches are listed. The structured infographic remains the source of truth.
"""
from __future__ import annotations

import difflib
import re
import unicodedata

from . import config, imagegen

SIZE = "1024x1536"  # portrait poster

READBACK_INSTRUCTION = ("Transcribe every piece of text visible in this image exactly as it is written, including any "
                        "misspellings, one text block per line. Output only the transcription, nothing else.")


def lines(content: dict) -> list[tuple[str, str]]:
    """(role, exact text) for every string the design must show."""
    out: list[tuple[str, str]] = []

    def add(role: str, value) -> None:
        v = re.sub(r"\s+", " ", str(value or "")).strip()
        if v:
            out.append((role, v))

    add("TITLE", content.get("title"))
    add("SUBTITLE", content.get("subtitle"))
    hs = content.get("headline_stat") or {}
    add("HERO STAT", hs.get("value"))
    add("HERO STAT LABEL", hs.get("label"))
    for i, sec in enumerate(content.get("sections") or [], 1):
        add(f"PANEL {i} HEADING", sec.get("heading"))
        add(f"PANEL {i} STAT", sec.get("stat_value"))
        add(f"PANEL {i} STAT LABEL", sec.get("stat_label"))
        add(f"PANEL {i} TEXT", sec.get("text"))
    ch = content.get("chart") or {}
    if ch.get("chart_type") not in (None, "", "none") and ch.get("data"):
        add("CHART TITLE", ch.get("title"))
        for d in ch["data"][:8]:
            v = d.get("value", "")
            v = f"{v:g}" if isinstance(v, (int, float)) else v  # 12.0 -> 12
            add("CHART BAR", f"{d.get('label', '')}: {v}{(' ' + ch['unit']) if ch.get('unit') else ''}")
    for m in content.get("key_messages") or []:
        add("KEY MESSAGE", m)
    add("CALL TO ACTION", content.get("call_to_action"))
    note = (content.get("source_note") or "").strip()
    add("FOOTER", note if note.lower().startswith("source") else (f"Source: {note}" if note else ""))
    return out


def prompt(content: dict, language: str) -> str:
    layout = (content.get("layout") or {}).get("type", "vertical_flow").replace("_", " ")
    icons = {i + 1: s.get("icon") for i, s in enumerate(content.get("sections") or []) if s.get("icon")}
    body = "\n".join(f'{role}: "{text}"' for role, text in lines(content))
    icon_note = "; ".join(f"panel {k}: simple {v} line icon" for k, v in icons.items())
    return (
        "Design a clean, professional editorial infographic poster in portrait orientation.\n"
        f"Render ONLY the exact text below, spelled exactly as given ({language}). Do not add any other words, numbers, "
        "dates, logos, watermarks or signatures. Do not translate, abbreviate or rephrase.\n"
        f"Layout: {layout}; clear visual hierarchy, a large hero statistic, evenly spaced panels, generous white space.\n"
        "Style: flat vector, deep navy and slate blue with one amber accent, sans-serif type, high contrast, "
        f"simple line icons{(' (' + icon_note + ')') if icon_note else ''}. No photographs, no people, no maps, no flags.\n\n"
        f"{body}"
    )


async def render(content: dict, language: str) -> tuple[bytes, str]:
    p = prompt(content, language)
    return await imagegen.openai_image(p, SIZE, config.OPENAI_INFOGRAPHIC_MODEL, config.OPENAI_IMAGE_QUALITY, timeout=240), p


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = "".join(str(unicodedata.digit(ch)) if ch.isdigit() else ch for ch in s)  # Devanagari etc. digits -> ASCII
    s = re.sub(r"[^\w\s.%]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _numbers(s: str) -> set[str]:
    return {n.rstrip(".").lstrip("0") or "0" for n in re.findall(r"\d+(?:[.,]\d+)*", _norm(s).replace(",", ""))}


def readback_check(expected: list[tuple[str, str]], transcript: str) -> dict:
    """Every expected line must be found again, and the image may not show a number the content does not contain."""
    seen = _norm(transcript)
    seen_lines = [_norm(x) for x in transcript.splitlines() if x.strip()]
    seen_words = set(seen.split())
    missing = []
    for role, text in expected:
        want = _norm(text)
        if not want or want in seen:
            continue
        words = [w for w in want.split() if len(w) > 1]
        if words and all(w in seen_words for w in words):
            continue
        best = max((difflib.SequenceMatcher(None, want, s).ratio() for s in seen_lines), default=0.0)
        if best < 0.9:
            missing.append({"role": role, "expected": text, "similarity": round(best, 2)})
    allowed = set().union(*(_numbers(t) for _, t in expected)) if expected else set()
    extra = sorted(_numbers(transcript) - allowed)
    return {"status": "passed" if not missing and not extra else "issues", "checked_lines": len(expected),
            "missing": missing, "unexpected_numbers": extra, "transcript": transcript[:3000]}
