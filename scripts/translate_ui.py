"""Build the web app's translation catalogs.

1. Extracts every tr("...") / msg("...") string from web/src plus web/src/i18n/server-strings.json
   (fixed values the API sends; regenerate with scripts/export_ui_strings.py).
2. Translates only strings missing from web/src/i18n/locales/<code>.json using GroqCloud (GROQ_API_KEY),
   in batches, preserving {placeholders} exactly; a line whose placeholders do not survive stays English.
   Uses OpenAI (OPENAI_API_KEY) when set, otherwise GroqCloud (GROQ_API_KEY).
3. Writes sorted JSON so native speakers can review or correct any line; re-running only fills gaps.

Usage:  .venv/bin/python scripts/translate_ui.py [--langs hi,ta] [--extract-only]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "src"
LOCALES = WEB / "i18n" / "locales"
LANGS = {"hi": "Hindi", "ta": "Tamil", "te": "Telugu", "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi",
         "bn": "Bengali", "gu": "Gujarati"}
CALL = re.compile(r'\b(?:tr|msg)\(\s*"((?:[^"\\]|\\.)*)"')
PLACEHOLDER = re.compile(r"\{\w+\}")
KEEP = ("PRAMAAN, JSON2Video, Groq, Cloudflare, Pollinations, Nova Reel, FLUX, Azure, Aura-2, MP4, PPTX, PDF, DOCX, SVG, SRT, "
        "JSON, URL, ID, SHA-256, API, SSO, LinkedIn, X, MFA, IST, TR-, TLP, HF_TOKEN and any model or file name")

SYSTEM = f"""You translate user-interface strings of PRAMAAN, an enterprise AI transformation workspace used by Indian
government, defence and security teams. Rules:
- Target a concise, formal software-interface register as used in Indian government applications.
- Keep every {{placeholder}} exactly as written (same name, same braces). Never translate text inside braces.
- Keep these untranslated: {KEEP}.
- Translate domain terms (artefact, claim, evidence, provenance, ledger, red team, approval, audit) with the term an
  Indian government user would recognise; transliterate into the target script only when no common term exists.
- "artefact"/"artifact" means a generated communication output (executive summary, advisory, post, slide deck,
  video package) - never artwork or an archaeological object. Translate it as output/document.
- "{{n}} of {{total}}" means n out of total (the first placeholder is the part). Reorder words for natural grammar,
  but keep that meaning, e.g. Hindi "{{total}} में से {{n}}".
- "claim" means a factual statement extracted from a source; "source" means an input document.
- Only the name PRAMAAN is a brand. Translate descriptive phrases such as "AI Transformation Workspace" and
  "Secure Mode" (keep "AI" as the common term used in the target language).
- Keep punctuation such as ·, →, …, “ ” and trailing colons. Keep sentence case. Do not add explanations.
Return JSON: {{"t": {{"<English>": "<translation>", ...}}}} with exactly the keys you were given."""


def extract() -> list[str]:
    found: set[str] = set()
    for f in list(WEB.rglob("*.ts")) + list(WEB.rglob("*.tsx")):
        if "i18n/locales" in str(f):
            continue
        for m in CALL.finditer(f.read_text(encoding="utf-8")):
            found.add(json.loads(f'"{m.group(1)}"'))
    server = WEB / "i18n" / "server-strings.json"
    if server.exists():
        found |= set(json.loads(server.read_text(encoding="utf-8")))
    return sorted(s for s in found if re.search(r"[A-Za-z]{2}", s) and s == s.strip())


PROVIDERS = {
    # GPT-5-family models only accept the default temperature.
    "openai": {"url": "https://api.openai.com/v1/chat/completions", "env": "OPENAI_API_KEY",
               "models": [os.getenv("OPENAI_TRANSLATE_MODEL", "gpt-5.4-mini")] * 2, "extra": {}},
    "groq": {"url": "https://api.groq.com/openai/v1/chat/completions", "env": "GROQ_API_KEY",
             "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b"], "extra": {"temperature": 0.2}},
}
PROVIDER = PROVIDERS["groq"]


def translate_batch(client: httpx.Client, key: str, lang: str, batch: list[str], prefer: int = 0) -> dict[str, str]:
    body = {"messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": f"Target language: {lang}.\n" + json.dumps(batch, ensure_ascii=False)}],
            "max_completion_tokens": 12000, "reasoning_effort": "low",
            "response_format": {"type": "json_object"}, **PROVIDER["extra"]}
    for attempt in range(8):
        model = PROVIDER["models"][(prefer + attempt) % 2]
        r = client.post(PROVIDER["url"], json={**body, "model": model},
                        headers={"Authorization": f"Bearer {key}"})
        if r.status_code == 200:
            try:
                data = json.loads(r.json()["choices"][0]["message"]["content"])
                return data.get("t", data) if isinstance(data, dict) else {}
            except (ValueError, KeyError):
                continue
        if r.status_code == 429:
            wait = float(r.headers.get("retry-after", "8") or 8)
            time.sleep(min(wait + 1, 30))
            continue
        time.sleep(3)
    return {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(LANGS))
    ap.add_argument("--extract-only", action="store_true")
    ap.add_argument("--batch", type=int, default=45)
    args = ap.parse_args()
    strings = extract()
    print(f"{len(strings)} interface strings")
    if args.extract_only:
        return
    load_dotenv(ROOT / ".env")
    global PROVIDER
    PROVIDER = PROVIDERS["openai" if os.getenv("OPENAI_API_KEY") else "groq"]
    key = os.getenv(PROVIDER["env"], "")
    if not key:
        sys.exit("OPENAI_API_KEY or GROQ_API_KEY is required")
    LOCALES.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=120) as client:
        for code in args.langs.split(","):
            path = LOCALES / f"{code}.json"
            cat = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            todo = [s for s in strings if s not in cat]
            print(f"[{code}] {len(todo)} to translate", flush=True)
            for i in range(0, len(todo), args.batch):
                batch = todo[i:i + args.batch]
                got = translate_batch(client, key, LANGS[code], batch, prefer=(i // args.batch) % 2)
                ok = 0
                for en in batch:
                    tx = got.get(en)
                    if isinstance(tx, str) and tx.strip() and sorted(PLACEHOLDER.findall(tx)) == sorted(PLACEHOLDER.findall(en)):
                        cat[en] = tx.strip()
                        ok += 1
                path.write_text(json.dumps(dict(sorted(cat.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
                print(f"[{code}] {min(i + args.batch, len(todo))}/{len(todo)} (+{ok})", flush=True)
            stale = [k for k in cat if k not in set(strings)]
            for k in stale:
                cat.pop(k)
            path.write_text(json.dumps(dict(sorted(cat.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"[{code}] done: {len(cat)}/{len(strings)} translated", flush=True)


if __name__ == "__main__":
    main()
