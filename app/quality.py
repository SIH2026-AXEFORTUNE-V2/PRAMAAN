"""Deterministic post-generation checks.

1. Grounding: every significant number in a deliverable must appear in the source
   (or the analysis digest). Numbers that do not are surfaced to the operator as
   "unverified" so hallucinated figures are caught before publication.
2. Format rules: platform limits and structural requirements per deliverable.
   Some are auto-repaired (e.g. video timings, derived subtitles).
"""
from __future__ import annotations

import re

NUM_RE = re.compile(r"(?<![\w/])[$€£₹]?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|[kKmMbB]n?\b|Cr\b|crore|lakh|million|billion)?")
THREAD_NUM_RE = re.compile(r"\b\d{1,2}\s?/\s?\d{1,2}\b")
SKIP_KEYS = {"color_palette", "advisory_id", "scene_number", "start_sec", "end_sec", "duration_seconds", "layout",
             "icon", "chart_type", "priority", "mode", "classification", "severity", "best_time_to_post",
             "subtitles", "chars", "music_direction", "audio_cue", "camera_direction"}


def _strings(obj, key: str = "") -> list[str]:
    if key in SKIP_KEYS:
        return []
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for k, v in obj.items() for s in _strings(v, k)]
    if isinstance(obj, list):
        return [s for v in obj for s in _strings(v, key)]
    return []


def _core(num: str) -> str:
    return re.sub(r"[^\d.]", "", num).rstrip(".")


def grounding(output: dict, corpus: str) -> dict:
    corpus_digits = {_core(m.group()) for m in NUM_RE.finditer(corpus)}
    corpus_compact = corpus.replace(",", "")
    checked, unverified = 0, []
    for text in _strings(output):
        text = THREAD_NUM_RE.sub(" ", text)
        for m in NUM_RE.finditer(text):
            core = _core(m.group())
            if not core or core == ".":
                continue
            # single digits and small ordinals ("3 steps", "Phase 2") are not claims worth checking
            if "." not in core and len(core) < 2 and not m.group().strip().endswith("%"):
                continue
            checked += 1
            if core in corpus_digits or core in corpus_compact:
                continue
            unverified.append(m.group().strip())
    uniq = list(dict.fromkeys(unverified))
    score = 1.0 if checked == 0 else round((checked - len(unverified)) / checked, 3)
    return {"numbers_checked": checked, "unverified_numbers": uniq[:15], "score": score}


def fmt_ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_subtitles(scenes: list[dict], max_chars: int = 84) -> list[dict]:
    """Split each scene's narration into caption chunks timed proportionally to word count."""
    subs = []
    for sc in scenes:
        words = (sc.get("narration") or "").split()
        if not words:
            continue
        chunks, cur = [], []
        for w in words:
            if cur and len(" ".join(cur + [w])) > max_chars:
                chunks.append(cur)
                cur = []
            cur.append(w)
            if w.endswith((".", "?", "!")) and len(" ".join(cur)) > max_chars * 0.45:
                chunks.append(cur)
                cur = []
        if cur:
            chunks.append(cur)
        start, end = float(sc.get("start_sec", 0)), float(sc.get("end_sec", 0))
        span = max(end - start, 0.5)
        t = start
        for ch in chunks:
            dur = span * len(ch) / len(words)
            subs.append({"index": len(subs) + 1, "start": fmt_ts(t), "end": fmt_ts(min(t + dur, end)), "text": " ".join(ch)})
            t += dur
    return subs


def check_and_repair(otype: str, data: dict, params: dict) -> list[str]:
    """Returns human-readable warnings; mutates data for safe, mechanical repairs."""
    warnings: list[str] = []
    if otype == "twitter":
        for i, t in enumerate(data.get("tweets", []), 1):
            n = len(t.get("text", ""))
            t["chars"] = n
            if n > 280:
                warnings.append(f"Tweet {i} is {n} characters (limit 280).")
        want = params.get("twitter_mode")
        if want == "thread" and len(data.get("tweets", [])) < 2:
            warnings.append("A thread was requested but a single tweet was returned.")
    elif otype == "linkedin":
        n = len(data.get("post", ""))
        data["chars"] = n
        if n > 3000:
            warnings.append(f"Post is {n} characters; LinkedIn allows 3,000.")
        if "**" in data.get("post", ""):
            data["post"] = data["post"].replace("**", "")
            warnings.append("Removed markdown bold markers that LinkedIn would show literally.")
    elif otype == "video":
        scenes = sorted(data.get("scenes", []), key=lambda s: s.get("start_sec", 0))
        target = float(params.get("video_duration") or data.get("duration_seconds") or 60)
        if scenes:
            # normalise to contiguous timings scaled to the requested length
            raw_total = max(float(scenes[-1].get("end_sec", 0)), 1.0)
            if abs(raw_total - target) > 1 or any(
                    abs(float(a.get("end_sec", 0)) - float(b.get("start_sec", 0))) > 0.5 for a, b in zip(scenes, scenes[1:])):
                warnings.append("Scene timings were normalised to be contiguous and match the requested length.")
                lengths = [max(float(s.get("end_sec", 0)) - float(s.get("start_sec", 0)), 1.0) for s in scenes]
                total = sum(lengths)
                t = 0.0
                for s, ln in zip(scenes, lengths):
                    s["start_sec"] = round(t, 1)
                    t += ln * target / total
                    s["end_sec"] = round(t, 1)
                scenes[-1]["end_sec"] = target
            for i, s in enumerate(scenes, 1):
                s["scene_number"] = i
                dur = s["end_sec"] - s["start_sec"]
                wps = len((s.get("narration") or "").split()) / max(dur, 0.1)
                if wps > 3.2:
                    warnings.append(f"Scene {i} narration is dense ({wps:.1f} words/sec); consider trimming.")
        data["scenes"] = scenes
        data["duration_seconds"] = int(target)
        data["subtitles"] = build_subtitles(scenes)
    elif otype == "presentation":
        want = int(params.get("slide_count") or 0)
        got = len(data.get("slides", []))
        if want and got != want:
            warnings.append(f"{got} slides generated; {want} were requested.")
    elif otype == "infographic":
        chart = data.get("chart") or {}
        if chart.get("chart_type") == "bar" and len(chart.get("data", [])) < 2:
            chart["chart_type"] = "none"
    return warnings
