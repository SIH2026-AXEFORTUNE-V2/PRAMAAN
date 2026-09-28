"""Offline engine (used when no model gateway is configured, or as a fallback).

Runs the full pipeline without any model API. Built-in sample sources return curated,
hand-written deliverables; any other input gets schema-valid deliverables assembled
with extractive heuristics from the source text. Stage timings are simulated so the
dashboard behaves like a live run. Set HF_TOKEN to switch to the Hugging Face engine.
"""
from __future__ import annotations

import asyncio
import copy
import json
import random
import re

from . import config

STOP = set("the a an and or of to in on for with by from at as is are was were be been this that these those it its "
           "their our your has have had will would can could should may might not no into over under than then also".split())


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if 30 <= len(p.strip()) <= 400]


def _numbers(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"[$€£₹]?\d[\d,]*(?:\.\d+)?\s?(?:%|million|billion|crore|Cr)?", text)))


def _caps(text: str) -> list[str]:
    found = re.findall(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b", text)
    out = []
    for f in found:
        if f.split()[0].lower() in STOP or len(f) < 4:
            continue
        if f not in out:
            out.append(f)
    return out[:10]


def _short(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _load_samples() -> dict[str, dict]:
    out = {}
    for p in sorted(config.SAMPLES_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[d["id"]] = d
    return out


SAMPLES = _load_samples()


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip().lower()


def match_sample(text: str) -> dict | None:
    key = _norm(text)[:400]
    for s in SAMPLES.values():
        if key and _norm(s["text"])[:400] == key:
            return s
    return None


def _usage(obj, text_in: str = "") -> dict:
    out_chars = len(json.dumps(obj, ensure_ascii=False))
    return {"model": ScriptedEngine.model, "input_tokens": 900 + len(text_in) // 4, "output_tokens": out_chars // 4}


class ScriptedEngine:
    mode = "scripted"
    model = "offline-extractive"

    async def brief(self, text: str) -> tuple[dict, dict]:
        await asyncio.sleep(random.uniform(2.2, 3.2))
        sample = match_sample(text)
        if sample:
            return copy.deepcopy(sample["brief"]), _usage(sample["brief"], text)
        data, _ = self._heuristic_brief(text)
        return data, _usage(data, text)

    def _heuristic_brief(self, text: str) -> tuple[dict, dict]:
        text = text or "No text content was extracted from this source."
        sents = _sentences(text) or [text[:300]]
        nums = _numbers(text)
        title = _short(text.strip().split("\n", 1)[0], 80)
        facts = []
        for n in nums[:8]:
            ctx = next((s for s in sents if n in s), "")
            label = " ".join(w for w in re.findall(r"[A-Za-z]+", ctx)[:4]) or "Figure"
            facts.append({"label": label.title(), "value": n, "category": "METRIC", "confidence": 0.8,
                          "evidence": _short(ctx, 150)})
        while len(facts) < 3:
            s = sents[len(facts) % len(sents)]
            facts.append({"label": "Statement", "value": _short(s, 60), "category": "CONTEXT", "confidence": 0.7, "evidence": _short(s, 150)})
        lower = text.lower()
        severity = "critical" if "critical" in lower else "high" if any(w in lower for w in ("breach", "attack", "exploit", "urgent")) else "medium"
        return {
            "title": title, "source_type": "other", "domain": "General",
            "summary": " ".join(sents[:2]), "core_intent": _short(sents[0], 160),
            "key_points": [_short(s, 160) for s in sents[:5]] + [""] * max(0, 3 - len(sents[:5])),
            "key_facts": facts,
            "entities": [{"name": c, "type": "organization"} for c in _caps(text)],
            "sentiment": "negative" if severity in ("high", "critical") else "neutral",
            "severity": severity, "recommended_audiences": ["Senior executives / Board", "General public"],
            "information_gaps": ["No explicit dates or owners were found in the source."],
            "source_digest": " ".join(sents[:12]), "confidence": 0.5,
        }, {"model": self.model, "input_tokens": 0, "output_tokens": 0}

    async def write(self, otype: str, brief: dict, params: dict, text: str = "") -> tuple[dict, dict]:
        await asyncio.sleep(random.uniform(2.5, 6.5))
        sample = match_sample(text)
        if sample and otype in sample["outputs"]:
            data = self._apply_params(otype, copy.deepcopy(sample["outputs"][otype]), params)
        else:
            data = self._heuristic(otype, brief, params)
        return data, _usage(data, text)

    @staticmethod
    def _apply_params(otype: str, d: dict, params: dict) -> dict:
        if otype == "twitter" and params["twitter_mode"] == "single":
            d = {**d, "mode": "single", "tweets": [{"text": d["alternates"][0]}], "alternates": d["alternates"][1:] + [d["tweets"][0]["text"][4:]]}
        if otype == "presentation":
            n = int(params["slide_count"])
            if n < len(d["slides"]):
                d["slides"] = d["slides"][: n - 1] + [d["slides"][-1]]
        return d

    def _heuristic(self, otype: str, brief: dict, params: dict) -> dict:
        pts = [p for p in brief["key_points"] if p] or [brief["summary"]]
        facts = brief["key_facts"]
        title = brief["title"]
        stat = facts[0]
        builders = {
            "video": lambda: self._video(title, pts, params),
            "linkedin": lambda: {
                "hook": _short(pts[0], 140),
                "post": _short(pts[0], 140) + "\n\n" + "\n\n".join(f"→ {p}" for p in pts[1:4]) + "\n\nWhat is your take?",
                "hashtags": ["#Insights", "#Leadership"], "alternate_hooks": [_short(p, 140) for p in pts[1:3]] or ["[hook]", "[hook]"],
                "suggested_visual": "A clean data card highlighting the headline figure.", "best_time_to_post": "Tue-Thu, 8-10 AM local time.",
            },
            "twitter": lambda: {
                "mode": params["twitter_mode"],
                "tweets": [{"text": _short(f"{i}/{min(len(pts), 5)} {p}", 280)} for i, p in enumerate(pts[:5], 1)]
                if params["twitter_mode"] == "thread" else [{"text": _short(pts[0], 270)}],
                "alternates": [_short(p, 270) for p in pts[1:3]], "hashtags": [], "suggested_media": "Chart of the key figure.",
            },
            "advisory": lambda: {
                "advisory_id": "ADV-DEMO-001", "title": title, "classification": "TLP:CLEAR", "severity": brief["severity"],
                "status": "Active", "summary": brief["summary"], "background": pts[0], "affected": [e["name"] for e in brief["entities"][:4]] or ["[affected parties]"],
                "impact": pts[-1], "details": [{"heading": "Key point", "body": p} for p in pts[:3]],
                "recommendations": [{"priority": "immediate", "action": "Review the source and confirm exposure.", "owner": "Risk team"},
                                    {"priority": "short-term", "action": "Brief stakeholders on the findings.", "owner": "Communications"}],
                "indicators": [], "references": [], "contact": "[contact point]",
            },
            "infographic": lambda: {
                "title": _short(title, 50), "subtitle": _short(brief["summary"], 90),
                "headline_stat": {"value": _short(stat["value"], 10), "label": _short(stat["label"], 50)},
                "sections": [{"heading": _short(f["label"], 30), "icon": ic, "stat_value": _short(f["value"], 10), "stat_label": f["category"].title(), "text": _short(f.get("evidence") or f["value"], 120)}
                             for f, ic in zip(facts[:4], ["chart", "alert", "users", "target"])],
                "chart": {"chart_type": "none", "title": "", "unit": "", "data": []},
                "key_messages": [_short(p, 80) for p in pts[:3]],
                "layout": {"type": "vertical_flow", "rationale": "Top-down reading order suits a single narrative.",
                           "color_palette": ["#0B0B0C", "#E5484D", "#F5A524", "#16A34A"], "typography": "Inter / Source Serif",
                           "visual_hierarchy": ["Headline stat", "Sections", "Key messages"]},
                "call_to_action": "Read the full source.", "source_note": "Source: operator-provided content",
            },
            "executive_summary": lambda: {
                "title": title, "bottom_line": pts[0], "situation": brief["summary"], "key_findings": pts[:4],
                "implications": pts[1:3] or pts[:1] * 2, "metrics": [{"label": f["label"], "value": f["value"]} for f in facts[:3]],
                "recommended_actions": [{"action": "Validate findings with domain owners.", "owner": "COO office", "timeline": "This week"},
                                        {"action": "Decide on communication plan.", "owner": "Leadership", "timeline": "Next 2 weeks"}],
                "risks": ["Figures should be verified against the original source before circulation."], "decision_required": "None - for awareness",
            },
            "presentation": lambda: self._deck(title, brief, pts, int(params["slide_count"])),
        }
        return builders[otype]()

    @staticmethod
    def _video(title: str, pts: list[str], params: dict) -> dict:
        dur = int(params["video_duration"])
        n = min(max(len(pts), 3), 6)
        step = dur / n
        scenes = [{
            "scene_number": i + 1, "start_sec": round(i * step, 1), "end_sec": round((i + 1) * step, 1),
            "title": f"Beat {i + 1}", "visual_description": "Motion-graphic card over subtle dark background.",
            "on_screen_text": _short(pts[i % len(pts)], 50), "narration": _short(pts[i % len(pts)], int(step * 2.3) * 7),
            "camera_direction": "Static, slow zoom", "visual_recommendation": "Animated typography", "audio_cue": "Low ambient pulse",
        } for i in range(n)]
        return {"title": title, "logline": pts[0], "target_platform": "LinkedIn / YouTube", "duration_seconds": dur,
                "script": "\n\n".join(f"SCENE {s['scene_number']} - {s['title']}\n{s['narration']}" for s in scenes), "scenes": scenes,
                "visual_style": {"look_and_feel": "Editorial, high-contrast", "color_palette": ["#0B0B0C", "#FFFFFF", "#E5484D"],
                                 "typography": "Inter Bold headings", "music_direction": "Minimal electronic"},
                "call_to_action": "Learn more."}

    @staticmethod
    def _deck(title: str, brief: dict, pts: list[str], n: int) -> dict:
        slides = [{"layout": "title", "title": _short(title, 60), "bullets": [], "right_bullets": [], "stat_value": "", "stat_label": "",
                   "quote": "", "visual_suggestion": "Full-bleed dark cover", "speaker_notes": brief["summary"]}]
        for i in range(n - 2):
            p = pts[i % len(pts)]
            slides.append({"layout": "bullets", "title": _short(p, 50), "bullets": [_short(x, 80) for x in pts[:3]], "right_bullets": [],
                           "stat_value": "", "stat_label": "", "quote": "", "visual_suggestion": "Supporting icon row", "speaker_notes": p})
        slides.append({"layout": "closing", "title": "Key takeaways", "bullets": [_short(p, 80) for p in pts[:3]], "right_bullets": [],
                       "stat_value": "", "stat_label": "", "quote": "", "visual_suggestion": "", "speaker_notes": "Thank you."})
        return {"title": title, "subtitle": brief["domain"], "slides": slides}
