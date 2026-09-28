"""Static registries (agents, model router, templates, connectors) and Transform-Bench evaluation."""
from __future__ import annotations

import os

from . import config

AGENTS = [
    {"name": "Orchestrator", "role": "Plans the job, selects agents, runs parallel tasks, detects failure, triggers repair "
     "and escalates to human review.", "capability": "planning", "inputs": ["User intent", "Transformation contract"],
     "outputs": ["Task graph", "Plan"], "kind": "control"},
    {"name": "Source Understanding Agent", "role": "Parses documents, recovers page structure; routes images, scans, audio "
     "and video through perception.", "capability": "document_parsing", "inputs": ["Source file / URL / text"],
     "outputs": ["Normalised source text", "Page map"], "kind": "perception"},
    {"name": "Evidence Extraction Agent", "role": "Extracts facts with verbatim quotes; every quote is checked against the "
     "source to earn a claim status.", "capability": "text_reasoning", "inputs": ["Source text"],
     "outputs": ["Claim ledger", "Source conflicts"], "kind": "evidence"},
    {"name": "Executive Summary Agent", "role": "BLUF briefing for leadership.", "capability": "text_reasoning",
     "inputs": ["Claim ledger", "Contract"], "outputs": ["Executive Summary"], "kind": "specialist"},
    {"name": "Advisory Agent", "role": "Structured advisory with severity, impact and prioritised actions.",
     "capability": "text_reasoning", "inputs": ["Claim ledger", "Contract"], "outputs": ["Advisory"], "kind": "specialist"},
    {"name": "Social Content Agent", "role": "LinkedIn posts and X threads within platform limits.",
     "capability": "text_reasoning", "inputs": ["Claim ledger", "Contract"], "outputs": ["LinkedIn Post", "X / Social Thread"],
     "kind": "specialist"},
    {"name": "Presentation Agent", "role": "Slide deck with layouts and speaker notes (PPTX).", "capability": "text_reasoning",
     "inputs": ["Claim ledger", "Contract"], "outputs": ["Presentation"], "kind": "specialist"},
    {"name": "Infographic Agent", "role": "Infographic copy, data and layout, rendered to SVG.", "capability": "text_reasoning",
     "inputs": ["Claim ledger", "Contract"], "outputs": ["Infographic"], "kind": "specialist"},
    {"name": "Video Package Agent", "role": "Script, storyboard, narration and subtitles.", "capability": "text_reasoning",
     "inputs": ["Claim ledger", "Contract"], "outputs": ["Video Package"], "kind": "specialist"},
    {"name": "Visual Agent", "role": "Generates illustrative images from writers' visual suggestions, and designs the infographic "
     "from its released text, then reads the design back to verify every line and figure. Illustration prompts are scrubbed "
     "of sensitive data and figures; images are labelled and never treated as evidence.", "capability": "image_generation",
     "inputs": ["Visual suggestions", "Released infographic"], "outputs": ["Illustrations", "Designed infographic"], "kind": "specialist"},
    {"name": "Video Production Agent", "role": "Renders the verified video package into one MP4: motion clips or animated "
     "stills, neural narration of the released script, burned-in subtitles and an AI-generated mark.",
     "capability": "video_production", "inputs": ["Video package", "Illustrations"], "outputs": ["MP4"], "kind": "specialist"},
    {"name": "Translation Agent", "role": "Language-constrained generation: specialist agents write natively in the contract "
     "language while facts stay locked to the English evidence ledger.", "capability": "translation",
     "inputs": ["Contract language"], "outputs": ["Localised artefacts"], "kind": "specialist"},
    {"name": "Consistency Agent", "role": "Compares the value every artefact states for each claim; flags cross-output conflicts.",
     "capability": "deterministic_verifier", "inputs": ["All artefacts", "Claim ledger"], "outputs": ["Conflicts"],
     "kind": "verification"},
    {"name": "Security Agent", "role": "Detects PII, credentials, infrastructure details, markings and prompt injection; "
     "applies the audience release policy.", "capability": "policy_engine", "inputs": ["Sources", "Artefacts", "Contract"],
     "outputs": ["Security findings", "Released versions"], "kind": "verification"},
    {"name": "Red Team / Critic Agent", "role": "Attacks outputs for drift, unsupported claims, leaks, contradictions and "
     "uncertainty strengthening. Never generates content.", "capability": "deterministic_verifier",
     "inputs": ["Verification results", "Security findings"], "outputs": ["Verdict"], "kind": "verification"},
    {"name": "Provenance Agent", "role": "Hashes sources, contract, evidence state and outputs into a hash-chained ledger.",
     "capability": "hash_chain", "inputs": ["State hashes"], "outputs": ["Ledger entries"], "kind": "verification"},
]


def model_router(live) -> list[dict]:
    gw = "Self-hosted gateway" if config.MODEL_GATEWAY_URL else "Hugging Face Inference Providers"
    on = live is not None
    if config.LLM_PROVIDER == "openai":
        def o(cap, label, models, status, via, note=""):
            return {"capability": cap, "label": label, "models": models, "status": status, "via": via, "note": note}
        fb = " Falls back to GroqCloud if OpenAI is unavailable." if config.GROQ_API_KEY else ""
        return [
            o("text_reasoning", "Text reasoning & generation", config.OPENAI_TEXT_MODELS, "active", "OpenAI",
              "First model serves the call; the next takes over if it fails." + fb),
            o("translation", "Translation", config.OPENAI_TEXT_MODELS[:1], "active", "OpenAI", "Language-constrained generation."),
            o("multimodal_understanding", "Multimodal understanding / OCR", [config.OPENAI_VISION_MODEL], "active", "OpenAI",
              "Images, scanned PDFs and the read-back check of designed infographics."),
            o("speech_to_text", "Speech-to-text", [config.OPENAI_ASR_MODEL], "active", "OpenAI"),
            o("document_parsing", "Document parsing", ["pypdf", "pypdfium2", "python-docx", "python-pptx"], "active", "Local"),
            o("policy_engine", "Security policy engine", ["PRAMAAN rules"], "active", "Local", "Deterministic detectors."),
            o("deterministic_verifier", "Verification", ["PRAMAAN verifier"], "active", "Local", "Deterministic checks."),
            o("hash_chain", "Provenance", ["SHA-256 hash chain"], "active", "Local"),
            o("image_generation", "Illustrations (Visual Agent)", [config.OPENAI_IMAGE_MODEL], "active", "OpenAI",
              "Illustrative only; never used as evidence."),
            o("infographic_design", "Designed infographics", [config.OPENAI_INFOGRAPHIC_MODEL], "active", "OpenAI",
              "Draws only the released text, then is read back and checked line by line."),
            o("text_to_speech", "Narration (text-to-speech)", [config.OPENAI_TTS_MODEL], "active", "OpenAI",
              "Multilingual; reads only the verified, released video script."),
            o("video_generation", "Motion video clips", [config.VIDEO_MODEL] if config.POLLINATIONS_API_KEY else [],
              "active" if config.POLLINATIONS_API_KEY else "not_configured", "Pollinations" if config.POLLINATIONS_API_KEY else "—",
              "Without it, scenes use animated stills; the MP4 still renders."),
            o("embedding", "Embeddings (retrieval)", [], "not_configured", "—", "Not needed for single-source transformation."),
        ]
    if config.LLM_PROVIDER == "groq":
        vis = "active" if config.HF_TOKEN else "not_configured"

        def r(cap, label, models, status, via, note=""):
            return {"capability": cap, "label": label, "models": models, "status": status, "via": via, "note": note}
        return [
            r("text_reasoning", "Text reasoning & generation", config.GROQ_TEXT_MODELS, "active", "GroqCloud",
              "Strongest model first; overflows to the next when its per-minute budget is used."),
            r("translation", "Translation", config.GROQ_TEXT_MODELS[:1], "active", "GroqCloud", "Language-constrained generation."),
            r("speech_to_text", "Speech-to-text", [config.GROQ_ASR_MODEL], "active", "GroqCloud"),
            r("multimodal_understanding", "Multimodal understanding / OCR", config.HF_VISION_MODELS if config.HF_TOKEN else [], vis,
              "Hugging Face" if config.HF_TOKEN else "—", "Images and scanned PDFs; text PDFs do not need it."),
            r("document_parsing", "Document parsing", ["pypdf", "pypdfium2", "python-docx", "python-pptx"], "active", "Local"),
            r("policy_engine", "Security policy engine", ["PRAMAAN rules"], "active", "Local", "Deterministic detectors."),
            r("deterministic_verifier", "Verification", ["PRAMAAN verifier"], "active", "Local", "Deterministic checks."),
            r("hash_chain", "Provenance", ["SHA-256 hash chain"], "active", "Local"),
            r("image_generation", "Illustrations (Visual Agent)", [config.IMAGE_MODEL] if config.CLOUDFLARE_API_TOKEN else [],
              "active" if config.CLOUDFLARE_API_TOKEN else "not_configured",
              "Cloudflare Workers AI" if config.CLOUDFLARE_API_TOKEN else "—", "Illustrative only; never used as evidence."),
            r("text_to_speech", "Narration (text-to-speech)", [config.TTS_MODEL] if config.CLOUDFLARE_API_TOKEN else [],
              "active" if config.CLOUDFLARE_API_TOKEN else "not_configured", "Cloudflare Workers AI" if config.CLOUDFLARE_API_TOKEN else "—",
              "Reads only the verified, released video script."),
            r("video_generation", "Motion video clips", [config.VIDEO_MODEL] if config.POLLINATIONS_API_KEY else [],
              "active" if config.POLLINATIONS_API_KEY else "not_configured", "Pollinations" if config.POLLINATIONS_API_KEY else "—",
              "Without it, scenes use animated stills; the MP4 still renders."),
            r("embedding", "Embeddings (retrieval)", [], "not_configured", "—", "Not needed for single-source transformation."),
        ]

    def row(cap, label, models, status, via, note=""):
        return {"capability": cap, "label": label, "models": models, "status": status, "via": via, "note": note}

    return [
        row("text_reasoning", "Text reasoning & generation", config.HF_TEXT_MODELS, "active" if on else "offline", gw,
            "Tried in order; the first available model serves the call."),
        row("translation", "Translation", config.HF_TEXT_MODELS[:1], "active" if on else "offline", gw,
            "Handled by the text model under the language contract."),
        row("multimodal_understanding", "Multimodal understanding / OCR", config.HF_VISION_MODELS, "active" if on else "offline", gw),
        row("speech_to_text", "Speech-to-text", [config.HF_ASR_MODEL], "active" if on else "offline", gw),
        row("document_parsing", "Document parsing", ["pypdf", "pypdfium2", "python-docx", "python-pptx"], "active", "Local"),
        row("policy_engine", "Security policy engine", ["PRAMAAN rules"], "active", "Local", "Deterministic detectors."),
        row("deterministic_verifier", "Verification", ["PRAMAAN verifier"], "active", "Local", "Deterministic checks."),
        row("hash_chain", "Provenance", ["SHA-256 hash chain"], "active", "Local"),
        row("embedding", "Embeddings (retrieval)", [os.getenv("EMBEDDING_MODEL", "")] if os.getenv("EMBEDDING_MODEL") else [],
            "not_configured", "—", "Set EMBEDDING_MODEL and a vector store (e.g. Qdrant) to enable retrieval."),
        row("text_to_speech", "Text-to-speech", [], "not_configured", "—", "No TTS provider configured."),
    ]


TEMPLATES = [
    {"id": "executive-brief", "name": "Executive Brief", "description": "Two-minute BLUF brief for senior officials.",
     "params": {"audience": "Senior Officials", "tone": "Executive", "objective": "Inform", "detail": "Brief", "style": "Text",
                "classification": "Internal"},
     "outputs": ["executive_summary"], "structure": ["Bottom line", "Situation", "Key findings", "Actions", "Decision required"],
     "security_policy": "Internal · leadership: PII masked, infrastructure generalised, markings reviewed",
     "evidence": "Every date, number and actor must map to a verified claim"},
    {"id": "security-advisory", "name": "Security Advisory", "description": "CERT-style advisory for defenders.",
     "params": {"audience": "Cybersecurity Teams", "tone": "Advisory", "objective": "Advise", "detail": "Detailed",
                "style": "Text", "classification": "Confidential"},
     "outputs": ["advisory"], "structure": ["Summary", "Affected", "Impact", "Indicators", "Prioritised recommendations"],
     "security_policy": "Internal · technical: indicators allowed, credentials always redacted",
     "evidence": "Indicators only if present in source; severity must follow source"},
    {"id": "incident-summary", "name": "Incident Summary", "description": "Summary plus advisory for an incident review.",
     "params": {"audience": "Executives", "tone": "Formal", "objective": "Summarize", "detail": "Medium", "style": "Mixed",
                "classification": "Internal"},
     "outputs": ["executive_summary", "advisory"], "structure": ["Timeline", "Impact", "Attribution (with certainty)", "Actions"],
     "security_policy": "Internal · leadership", "evidence": "Uncertainty preserved on attribution"},
    {"id": "leadership-update", "name": "Leadership Update", "description": "Summary, deck and infographic for a briefing.",
     "params": {"audience": "Senior Officials", "tone": "Formal", "objective": "Inform", "detail": "Medium", "style": "Mixed",
                "classification": "Internal"},
     "outputs": ["executive_summary", "advisory", "infographic", "presentation"],
     "structure": ["Summary", "Deck", "Infographic"], "security_policy": "Internal · leadership",
     "evidence": "Cross-output consistency required"},
    {"id": "public-statement", "name": "Public Statement", "description": "Public-safe posts with strict redaction.",
     "params": {"audience": "Public Communication", "tone": "Neutral", "objective": "Inform", "detail": "Brief", "style": "Text",
                "classification": "Public"},
     "outputs": ["linkedin", "twitter"], "structure": ["Hook", "What happened", "What we are doing", "Call to action"],
     "security_policy": "Public channel: PII / infrastructure redacted, markings blocked",
     "evidence": "No technical indicators; hedged attribution only"},
    {"id": "technical-brief", "name": "Technical Brief", "description": "Detailed advisory and deck for engineers.",
     "params": {"audience": "Technical Teams", "tone": "Technical", "objective": "Explain", "detail": "Comprehensive",
                "style": "Text", "classification": "Confidential"},
     "outputs": ["advisory", "presentation"], "structure": ["Root cause", "Affected systems", "Remediation"],
     "security_policy": "Internal · technical", "evidence": "Technical indicators preserved exactly"},
    {"id": "presentation", "name": "Presentation", "description": "Stand-alone slide deck with speaker notes.",
     "params": {"audience": "Executives", "tone": "Executive", "objective": "Recommend", "detail": "Medium", "style": "Visual",
                "classification": "Internal"},
     "outputs": ["presentation"], "structure": ["Title", "Situation", "Big stat", "Recommendations", "Close"],
     "security_policy": "Internal · leadership", "evidence": "Stats only from verified claims"},
    {"id": "social-package", "name": "Social Media Package", "description": "LinkedIn post, X thread and infographic.",
     "params": {"audience": "General Audience", "tone": "Neutral", "objective": "Inform", "detail": "Brief", "style": "Visual",
                "classification": "Public"},
     "outputs": ["linkedin", "twitter", "infographic"], "structure": ["Post", "Thread", "Visual"],
     "security_policy": "Public channel", "evidence": "Every figure grounded"},
    {"id": "video-package", "name": "Video Package", "description": "Script, storyboard and subtitles.",
     "params": {"audience": "General Audience", "tone": "Neutral", "objective": "Explain", "detail": "Medium", "style": "Visual",
                "classification": "Public"},
     "outputs": ["video"], "structure": ["Scenes", "Narration", "Subtitles"], "security_policy": "Public channel",
     "evidence": "On-screen text limited to verified claims"},
]

CONNECTORS = [
    {"id": "local-files", "name": "Local Files", "description": "Upload PDF, DOCX, PPTX, TXT, HTML, images, audio and video.",
     "status": "connected", "detail": f"Up to {config.MAX_UPLOAD_MB} MB per file"},
    {"id": "url", "name": "URL / Web Source", "description": "Fetch an article or PDF by URL; scripts are stripped.",
     "status": "connected", "detail": "HTTP(S) only; YouTube links not supported"},
    {"id": "doc-repo", "name": "Document Repository", "description": "SharePoint / DMS integration.",
     "status": "not_connected", "detail": "No repository connector is installed in this build."},
    {"id": "cloud-storage", "name": "Cloud Storage", "description": "S3-compatible object storage.",
     "status": "configuration_required", "detail": "Requires STORAGE_ENDPOINT, STORAGE_BUCKET and credentials in the environment."},
    {"id": "knowledge-base", "name": "Internal Knowledge Base", "description": "Retrieval over approved internal documents.",
     "status": "not_connected", "detail": "Requires an embedding model and a vector store (e.g. Qdrant)."},
]


def evaluate(transformations: list[dict]) -> dict:
    """Transform-Bench, computed from this workspace's completed transformations (automated checks only)."""
    done = [t for t in transformations if t["claims"] and any(a["content"] for a in t["artifacts"].values())]
    if not done:
        return {"label": "Not evaluated", "runs": 0, "metrics": []}
    refs = [r for t in done for a in t["artifacts"].values() if a.get("verification") for r in a["verification"]["refs"]]
    factual = [r for r in refs if r["claim_ids"] or r["status"] in ("drift", "unsupported")]
    grounded = sum(1 for r in factual if r["status"] in ("grounded", "review"))
    unsupported = sum(1 for r in refs if r["status"] == "unsupported")
    claims_total = sum(len([c for c in t["claims"] if c["status"] not in ("superseded",)]) for t in done)
    claims_used = sum(len({cid for a in t["artifacts"].values() if a.get("verification") for cid in a["verification"]["claims_used"]})
                      for t in done)
    multi = 0
    conflicted = 0
    for t in done:
        counts: dict[str, int] = {}
        for a in t["artifacts"].values():
            for cid in (a.get("verification") or {}).get("claims_used", []):
                counts[cid] = counts.get(cid, 0) + 1
        multi += sum(1 for v in counts.values() if v >= 2)
        conflicted += len(t["consistency"]["conflicts"])
    hedged_refs = [r for t in done for a in t["artifacts"].values() if a.get("verification") for r in a["verification"]["refs"]
                   if any(c["claim_id"] in r["claim_ids"] and c["modality"] != "confirmed" for c in t["claims"])]
    violations = sum(1 for r in hedged_refs if any(i["kind"] == "uncertainty" for i in r["issues"]))
    arts = [a for t in done for a in t["artifacts"].values() if a["content"]]
    leaks = sum((a.get("security") or {}).get("actions", {}).get("BLOCK", 0) for a in arts)
    with_hash = sum(1 for a in arts if a["output_hash"])
    changes = [h for t in done for c in t["claims"] for h in c["history"] if "total_artifacts" in h]
    touched = sum(h["dependents"] for h in changes)
    full = sum(h["total_artifacts"] for h in changes)

    def pct(a, b):
        return None if b == 0 else round(100 * a / b, 1)

    metrics = [
        {"key": "factual_fidelity", "label": "Factual Fidelity", "value": pct(grounded, len(factual)), "unit": "%",
         "basis": f"{grounded}/{len(factual)} factual sentences grounded in the claim ledger"},
        {"key": "claim_coverage", "label": "Claim Coverage", "value": pct(claims_used, claims_total), "unit": "%",
         "basis": f"{claims_used}/{claims_total} claims used by at least one artefact"},
        {"key": "unsupported_rate", "label": "Unsupported Claim Rate", "value": pct(unsupported, len(refs)), "unit": "%",
         "basis": f"{unsupported}/{len(refs)} checked sentences unsupported", "lower_is_better": True},
        {"key": "consistency", "label": "Cross-Output Consistency", "value": pct(multi - min(conflicted, multi), multi), "unit": "%",
         "basis": f"{conflicted} conflict(s) across {multi} claims shared by 2+ artefacts"},
        {"key": "uncertainty", "label": "Uncertainty Preservation", "value": pct(len(hedged_refs) - violations, len(hedged_refs)),
         "unit": "%", "basis": f"{violations} violation(s) in {len(hedged_refs)} sentences citing hedged claims"},
        {"key": "security_leakage", "label": "Security Leakage", "value": leaks, "unit": "items",
         "basis": "Blocked items remaining in released versions", "lower_is_better": True},
        {"key": "provenance", "label": "Provenance Coverage", "value": pct(with_hash, len(arts)), "unit": "%",
         "basis": f"{with_hash}/{len(arts)} artefacts with recorded output hash"},
        {"key": "recovery", "label": "Recovery Efficiency", "value": pct(full - touched, full) if changes else None,
         "unit": "%", "basis": (f"{full - touched}/{full} artefact regenerations avoided across {len(changes)} evidence change(s)"
                                if changes else "Not evaluated: no evidence changes recorded yet")},
    ]
    return {"label": f"Demo evaluation · {len(done)} local run(s) · automated checks, not a human-annotated benchmark",
            "runs": len(done), "metrics": metrics}
