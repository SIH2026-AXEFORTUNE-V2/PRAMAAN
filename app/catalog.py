"""Output catalog: every deliverable PRAMAAN can produce.

Each entry carries the JSON schema the model must answer in (structured output),
the format-specific brief for the specialist agent, and UI metadata. Adding a
new deliverable means adding one entry here plus a renderer/exporter.
"""
from __future__ import annotations

S = "string"
N = "number"
I = "integer"


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props.keys())}


def _arr(items: dict, min_items: int | None = None, max_items: int | None = None) -> dict:
    out: dict = {"type": "array", "items": items}
    if min_items is not None:
        out["minItems"] = min_items
    if max_items is not None:
        out["maxItems"] = max_items
    return out


def _str(desc: str = "", enum: list[str] | None = None) -> dict:
    out: dict = {"type": S}
    if desc:
        out["description"] = desc
    if enum:
        out["enum"] = enum
    return out


# ---------------------------------------------------------------------------
# Stage 1: content analysis ("Content Brief")
# ---------------------------------------------------------------------------
SOURCE_TYPES = [
    "news_article", "report", "advisory", "threat_intelligence", "policy_document",
    "research_paper", "announcement", "incident_report", "prompt", "media", "other",
]

BRIEF_SCHEMA = _obj({
    "title": _str("Short, specific title for the source content (max 12 words)."),
    "source_type": _str("Best matching category of the source.", SOURCE_TYPES),
    "domain": _str("Subject domain, e.g. Cybersecurity, Finance, Public Policy, Healthcare."),
    "summary": _str("Neutral 2-4 sentence summary of the source."),
    "core_intent": _str("What the source is trying to achieve or communicate, in one sentence."),
    "key_points": _arr(_str(), 3, 8),
    "key_facts": _arr(_obj({
        "label": _str("What the fact is, e.g. 'Affected users', 'Revenue', 'Effective date'."),
        "value": _str("The value exactly as stated in the source."),
        "category": _str("Short grouping such as IMPACT, FINANCIAL, TIMELINE, TECHNICAL, ACTOR, POLICY."),
        "subject": _str("The entity the fact is about, e.g. 'Incident', 'Payroll server', 'Threat actor'."),
        "confidence": {"type": N, "description": "0-1 confidence that the fact is stated explicitly in the source."},
        "evidence": _str("Verbatim quote (max 30 words) copied exactly from the source that supports the fact."),
    }), 3, 16),
    "entities": _arr(_obj({
        "name": _str("Entity text exactly as it appears in the source."),
        "type": _str("Entity type.", ["organization", "person", "location", "product", "date", "metric", "technology", "event", "other"]),
    }), 0, 20),
    "sentiment": _str("Overall sentiment.", ["positive", "neutral", "negative", "mixed"]),
    "severity": _str("Urgency / risk level conveyed by the source.", ["informational", "low", "medium", "high", "critical"]),
    "recommended_audiences": _arr(_str(), 1, 4),
    "information_gaps": _arr(_str("Information a communicator would want but the source does not give."), 0, 5),
    "source_digest": _str(
        "A faithful, detailed factual digest of the whole source (300-900 words). For images, audio or "
        "video, describe what is shown and transcribe speech and on-screen text. Never add facts."),
    "confidence": {"type": N, "description": "0-1 overall confidence in this analysis."},
})

# ---------------------------------------------------------------------------
# Stage 2: deliverable schemas
# ---------------------------------------------------------------------------
VIDEO_SCHEMA = _obj({
    "title": _str(),
    "logline": _str("One-sentence pitch of the video."),
    "target_platform": _str("Where the video is best published, e.g. LinkedIn, YouTube, internal town-hall."),
    "duration_seconds": {"type": I},
    "script": _str("Full narration script, scene by scene, with scene headers like 'SCENE 1 - Title'."),
    "scenes": _arr(_obj({
        "scene_number": {"type": I},
        "start_sec": {"type": N},
        "end_sec": {"type": N},
        "title": _str(),
        "visual_description": _str("What the viewer sees: setting, subjects, motion."),
        "on_screen_text": _str("Text overlay / lower third. Empty if none."),
        "narration": _str("Voice-over for this scene only."),
        "camera_direction": _str("Shot type and movement, e.g. 'Slow push-in, medium close-up'."),
        "visual_recommendation": _str("Stock footage, motion graphic, animation or asset suggestion."),
        "audio_cue": _str("Music / SFX cue."),
    }), 3, 10),
    "visual_style": _obj({
        "look_and_feel": _str(),
        "color_palette": _arr(_str("Hex colour like #111827"), 3, 6),
        "typography": _str(),
        "music_direction": _str(),
    }),
    "call_to_action": _str(),
})

LINKEDIN_SCHEMA = _obj({
    "hook": _str("The first 1-2 lines that appear before 'see more' (max 150 characters)."),
    "post": _str("The complete, ready-to-publish LinkedIn post including the hook, body and call to action. Plain text with line breaks; no markdown."),
    "hashtags": _arr(_str("Hashtag including #"), 2, 6),
    "alternate_hooks": _arr(_str(), 2, 3),
    "suggested_visual": _str("Image / carousel / document suggestion to accompany the post."),
    "best_time_to_post": _str("Suggested posting window and why."),
})

TWITTER_SCHEMA = _obj({
    "mode": _str("", ["single", "thread"]),
    "tweets": _arr(_obj({"text": _str("Tweet text, 280 characters maximum including hashtags and numbering.")}), 1, 12),
    "alternates": _arr(_str("Alternative standalone tweet, 280 characters max."), 0, 3),
    "hashtags": _arr(_str(), 0, 4),
    "suggested_media": _str("Image, chart or GIF suggestion."),
})

ADVISORY_SCHEMA = _obj({
    "advisory_id": _str("Identifier like 'ADV-2026-014'."),
    "title": _str(),
    "classification": _str("Distribution marking.", ["TLP:CLEAR", "TLP:GREEN", "TLP:AMBER", "TLP:RED", "PUBLIC", "INTERNAL"]),
    "severity": _str("", ["informational", "low", "medium", "high", "critical"]),
    "status": _str("e.g. 'Active', 'Monitoring', 'Resolved'."),
    "summary": _str("Two to four sentence overview."),
    "background": _str("Context the reader needs."),
    "affected": _arr(_str("Affected systems, groups, products, regions or stakeholders."), 1, 10),
    "impact": _str("What happens if nothing is done."),
    "details": _arr(_obj({"heading": _str(), "body": _str()}), 1, 6),
    "recommendations": _arr(_obj({
        "priority": _str("", ["immediate", "short-term", "long-term"]),
        "action": _str(),
        "owner": _str("Role or team responsible."),
    }), 2, 10),
    "indicators": _arr(_obj({"type": _str(), "value": _str()}), 0, 15),
    "references": _arr(_str(), 0, 8),
    "contact": _str("Who to contact for questions."),
})

INFO_ICONS = ["alert", "shield", "chart", "users", "globe", "clock", "money", "target", "lightbulb", "lock", "trend", "check", "doc", "server"]

INFOGRAPHIC_SCHEMA = _obj({
    "title": _str("Punchy headline, max 8 words."),
    "subtitle": _str("One-line framing, max 16 words."),
    "headline_stat": _obj({"value": _str("Big number or short phrase, max 10 characters."), "label": _str("What it means, max 10 words.")}),
    "sections": _arr(_obj({
        "heading": _str("Max 5 words."),
        "icon": _str("", INFO_ICONS),
        "stat_value": _str("Short number/phrase, max 10 characters, or empty."),
        "stat_label": _str("Max 6 words, or empty."),
        "text": _str("Max 22 words."),
    }), 3, 6),
    "chart": _obj({
        "chart_type": _str("", ["bar", "none"]),
        "title": _str(),
        "unit": _str("Unit suffix such as %, Cr, M, or empty."),
        "data": _arr(_obj({"label": _str(), "value": {"type": N}}), 0, 6),
    }),
    "key_messages": _arr(_str("Max 14 words."), 2, 4),
    "layout": _obj({
        "type": _str("", ["vertical_flow", "grid", "timeline", "comparison"]),
        "rationale": _str("Why this layout suits the content."),
        "color_palette": _arr(_str("Hex colour"), 3, 5),
        "typography": _str(),
        "visual_hierarchy": _arr(_str("Ordered reading-path recommendation."), 2, 5),
    }),
    "call_to_action": _str("Max 10 words."),
    "source_note": _str("Short source attribution line."),
})

EXEC_SUMMARY_SCHEMA = _obj({
    "title": _str(),
    "bottom_line": _str("BLUF: the single most important takeaway in 1-2 sentences."),
    "situation": _str("Context in 2-4 sentences."),
    "key_findings": _arr(_str(), 3, 6),
    "implications": _arr(_str(), 2, 5),
    "metrics": _arr(_obj({"label": _str(), "value": _str()}), 0, 4),
    "recommended_actions": _arr(_obj({"action": _str(), "owner": _str(), "timeline": _str()}), 2, 5),
    "risks": _arr(_str(), 0, 4),
    "decision_required": _str("The decision leadership must take, or 'None - for awareness'."),
})

PRESENTATION_SCHEMA = _obj({
    "title": _str(),
    "subtitle": _str(),
    "slides": _arr(_obj({
        "layout": _str("", ["title", "bullets", "two_column", "big_stat", "quote", "closing"]),
        "title": _str("Slide headline, max 10 words."),
        "bullets": _arr(_str("Max 14 words."), 0, 6),
        "right_bullets": _arr(_str("Second column for two_column layout; otherwise empty."), 0, 6),
        "stat_value": _str("For big_stat layout; otherwise empty."),
        "stat_label": _str("For big_stat layout; otherwise empty."),
        "quote": _str("For quote layout; otherwise empty."),
        "visual_suggestion": _str("Image, chart or diagram to place on the slide."),
        "speaker_notes": _str("What the presenter says, 60-130 words."),
    }), 3, 15),
})

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
OUTPUT_TYPES: dict[str, dict] = {
    "video": {
        "agent": "Video Package Agent",
        "label": "Video Package",
        "icon": "video",
        "description": "Script, storyboard, scenes, narration, subtitles and visual direction.",
        "schema": VIDEO_SCHEMA,
        "exports": ["mp4", "script", "md", "srt", "json"],
        "spec": (
            "Produce a complete, production-ready VIDEO PACKAGE for a {video_duration}-second video.\n"
            "- 4 to 8 scenes that are contiguous: the first starts at 0, each starts where the previous ended, the last ends at {video_duration}.\n"
            "- Narration pacing: about 2.3 spoken words per second of scene length. Do not overload scenes.\n"
            "- 'script' is the full narration assembled scene by scene with 'SCENE n - Title' headers.\n"
            "- Visual descriptions must be concrete enough for an editor or a generative video tool.\n"
            "- On-screen text must be short (max 8 words) and must only use facts from the source."
        ),
    },
    "linkedin": {
        "agent": "Social Content Agent",
        "label": "LinkedIn Post",
        "icon": "linkedin",
        "description": "A professional, publication-ready LinkedIn post with hooks and hashtags.",
        "schema": LINKEDIN_SCHEMA,
        "exports": ["md", "txt", "json"],
        "spec": (
            "Write a LinkedIn post ready to publish.\n"
            "- The hook (first 1-2 lines) must earn the 'see more' click; max 150 characters.\n"
            "- {linkedin_length}. Short paragraphs of 1-3 lines separated by blank lines.\n"
            "- Plain text only: no markdown asterisks or headers (LinkedIn does not render them). Bullets may use '•' or '→'.\n"
            "- End with a clear call to action or question that fits the objective.\n"
            "- Put hashtags ONLY in the 'hashtags' field, not in 'post'."
        ),
    },
    "twitter": {
        "agent": "Social Content Agent",
        "label": "X / Social Thread",
        "icon": "x",
        "description": "Platform-optimised tweet or numbered thread within character limits.",
        "schema": TWITTER_SCHEMA,
        "exports": ["md", "txt", "json"],
        "spec": (
            "Write Twitter/X content. Mode: {twitter_mode}.\n"
            "- single: exactly one tweet in 'tweets' plus 2 'alternates'.\n"
            "- thread: 4 to 8 tweets numbered like '1/7', '2/7'. Tweet 1 is the hook. Last tweet is the takeaway or CTA.\n"
            "- HARD LIMIT: every tweet (including numbering and hashtags) must be at most 280 characters. Aim for 200-260.\n"
            "- Use at most 2 hashtags in total across the content, placed naturally."
        ),
    },
    "advisory": {
        "agent": "Advisory Agent",
        "label": "Advisory",
        "icon": "shield",
        "description": "A structured advisory: severity, impact, affected parties and prioritised actions.",
        "schema": ADVISORY_SCHEMA,
        "exports": ["md", "docx", "json"],
        "spec": (
            "Write a structured ADVISORY document in the style used by CERTs, regulators and risk teams.\n"
            "- Severity must reflect the source; do not exaggerate.\n"
            "- Recommendations are concrete, verb-first, each with a priority and an owner role.\n"
            "- 'indicators' holds technical indicators (CVE IDs, IPs, hashes, domains, versions, dates) ONLY if present in the source; otherwise return an empty list.\n"
            "- 'references' lists sources named in the content; never invent URLs."
        ),
    },
    "infographic": {
        "agent": "Infographic Agent",
        "label": "Infographic",
        "icon": "layout",
        "description": "Infographic copy, data points, layout and colour recommendations, rendered as SVG.",
        "schema": INFOGRAPHIC_SCHEMA,
        "exports": ["svg", "md", "json"],
        "spec": (
            "Design the CONTENT and LAYOUT of an infographic.\n"
            "- Respect the word limits in the schema strictly; infographics fail when text-heavy.\n"
            "- Use real numbers from the source for stats and the chart. If the source has fewer than 2 comparable numbers, set chart_type to 'none' and data to [].\n"
            "- Pick icons from the allowed list that match each section.\n"
            "- Colour palette should suit the tone and severity (e.g. reds/ambers for critical threats, blues/greens for positive news)."
        ),
    },
    "executive_summary": {
        "agent": "Executive Summary Agent",
        "label": "Executive Summary",
        "icon": "briefcase",
        "description": "A concise BLUF briefing for leadership with findings, implications and actions.",
        "schema": EXEC_SUMMARY_SCHEMA,
        "exports": ["md", "docx", "json"],
        "spec": (
            "Write an EXECUTIVE SUMMARY for senior leaders who have two minutes.\n"
            "- Lead with the bottom line (BLUF).\n"
            "- Findings and implications are crisp single sentences, no filler.\n"
            "- 'metrics' contains only numbers that appear in the source.\n"
            "- Actions have an owner role and a realistic timeline."
        ),
    },
    "presentation": {
        "agent": "Presentation Agent",
        "label": "Presentation",
        "icon": "slides",
        "description": "Slide deck with layouts, visuals and speaker notes, exportable to PowerPoint.",
        "schema": PRESENTATION_SCHEMA,
        "exports": ["pptx", "md", "json"],
        "spec": (
            "Create a PRESENTATION of exactly {slide_count} slides.\n"
            "- Slide 1 uses layout 'title'; the final slide uses layout 'closing'.\n"
            "- Use a 'big_stat' slide when the source has a striking number, and vary layouts.\n"
            "- Bullets are short phrases (max 14 words, max 5 per slide), not paragraphs.\n"
            "- Speaker notes are natural spoken language, 60-130 words, adding detail not on the slide."
        ),
    },
}

# ---------------------------------------------------------------------------
# Transformation parameters (the configuration bar)
# ---------------------------------------------------------------------------
PARAMETERS = {
    "audience": {
        "label": "Audience",
        "options": ["Senior Officials", "Executives", "Technical Teams", "Cybersecurity Teams", "General Audience",
                    "Public Communication", "Custom"],
        "default": "Senior Officials",
    },
    "tone": {"label": "Tone", "options": ["Formal", "Neutral", "Technical", "Executive", "Advisory"], "default": "Formal"},
    "language": {
        "label": "Language",
        "options": ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati",
                    "French", "Spanish", "Arabic"],
        "default": "English",
    },
    "detail": {"label": "Detail level", "options": ["Brief", "Medium", "Detailed", "Comprehensive"], "default": "Medium"},
    "objective": {
        "label": "Objective",
        "options": ["Inform", "Recommend", "Summarize", "Advise", "Explain", "Alert", "Persuade"],
        "default": "Inform",
    },
    "style": {"label": "Style", "options": ["Text", "Visual", "Mixed"], "default": "Mixed"},
    "classification": {
        "label": "Classification",
        "options": ["Public", "Internal", "Confidential", "Restricted"],
        "default": "Internal",
    },
    "video_duration": {"label": "Video length (s)", "options": ["30", "60", "90", "120"], "default": "60"},
    "twitter_mode": {"label": "X format", "options": ["thread", "single"], "default": "thread"},
    "slide_count": {"label": "Slides", "options": ["5", "6", "8"], "default": "6"},
}


def normalise_params(raw: dict | None) -> dict:
    raw = raw or {}
    out = {}
    for key, meta in PARAMETERS.items():
        val = str(raw.get(key) or meta["default"]).strip()[:120]
        out[key] = val if val in meta["options"] else meta["default"]
    custom = str(raw.get("audience_custom") or "").strip()[:120]
    out["audience_custom"] = custom if out["audience"] == "Custom" else ""
    out["instructions"] = str(raw.get("instructions") or "").strip()[:1500]
    return out


def audience_text(params: dict) -> str:
    return params.get("audience_custom") or params["audience"]
