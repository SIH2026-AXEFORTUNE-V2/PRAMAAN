"""Collects every user-visible string the API sends as a fixed value (not generated content), so the web app's
translation catalogs cover them. Output: web/src/i18n/server-strings.json. Run after changing registries."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("PRAMAAN_DEMO_MODE", "1")
from app import catalog, config, orchestrator, registry, security  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
strings: set[str] = set()


def add(*vals):
    for v in vals:
        if isinstance(v, str) and re.search(r"[A-Za-z]", v):
            strings.add(v)


for meta in catalog.PARAMETERS.values():
    add(meta["label"], *meta["options"])
for o in catalog.OUTPUT_TYPES.values():
    add(o["label"], o["description"], o["agent"])
for _, title, detail in orchestrator.PLAN_STEPS:
    add(title, detail)
for a in registry.AGENTS:
    add(a["name"], a["role"], a["capability"].replace("_", " "), *a["inputs"], *a["outputs"])
for tpl in registry.TEMPLATES:
    add(tpl["name"], tpl["description"], tpl["security_policy"], tpl["evidence"], *tpl["structure"])
for c in registry.CONNECTORS:
    add(c["name"], c["description"], c["detail"])
for provider in ("openai", "groq", "huggingface"):
    config.LLM_PROVIDER = provider
    for r in registry.model_router(object()):
        add(r["label"], r["note"], r["via"])
for _, _, label, _ in security.DETECTORS:
    add(label)
add(*security.CLASS_LABEL.values(), *security.EXPOSURE_LABEL.values(), *security.REASON.values(), "Instruction-like text")
# fixed task titles, descriptions and progress details written by the orchestrator
src = (ROOT / "app" / "orchestrator.py").read_text()
for m in re.finditer(r'_task\(t, [^,]+, "([^"]+)", (?:f?"([^"{]+)"|f"[^"]*"), "[a-z]+",\s*"([^"]+)"', src):
    add(m.group(1), m.group(2) or "", m.group(3))
for m in re.finditer(r'(?:_start\(\w+, |_finish\(\w+, "[a-z_]+", |detail=|\["detail"\] = )"([^"{]+)"', src):
    add(m.group(1))
add("I'll analyse the source and generate the requested artefacts. Every factual statement will be locked to the evidence "
    "ledger, verified, security-checked and routed to you for approval.", "Queued", "Completed", "Running", "Interrupted",
    "Awaiting review", "Waiting", "In queue", "Human approval", "Understand request", "Plan transformations", "Screen sources",
    "Extract evidence", "Scan outputs · audience policy", "Cross-output consistency", "Adversarial review", "Record provenance",
    "Render narrated MP4", "Human Reviewer", "Orchestrator", "Re-rendering after read-back mismatch", "Read-back unavailable")
# audit actions are a fixed vocabulary (details stay as recorded)
for f in (ROOT / "app").glob("*.py"):
    for m in re.finditer(r'ledger\.audit\(\s*"([^"{]+)"', f.read_text()):
        add(m.group(1))
    for m in re.finditer(r'ledger\.audit\(\s*\{([^}]+)\}', f.read_text()):
        for v in re.findall(r':\s*"([^"]+)"', m.group(1)):
            add(v)
add("Human approval recorded", "Artefact rejected", "Changes requested", "Consistency verification passed",
    "Consistency verification found conflicts", "Red team review passed", "Red team review flagged issues")
for via in ("GroqCloud", "Hugging Face Inference Providers"):
    add(f"App and data stay on this server; model inference uses {via}. Credentials and injected instructions are withheld from model context.")
add("All model calls go to the self-hosted gateway.", "No model gateway configured; offline extractive engine.", "Hybrid", "On-Prem", "Offline")
out = ROOT / "web" / "src" / "i18n" / "server-strings.json"
out.write_text(json.dumps(sorted(strings), ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(strings)} server strings -> {out.relative_to(ROOT)}")
