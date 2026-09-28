# PRAMAAN · AI Transformation Workspace

**Transform content without losing the truth.** One source → one canonical evidence state → multiple audience-specific artefacts → cross-output verification → security controls → human approval → verifiable provenance.

PRAMAAN is not a chatbot or a plain content generator. Every factual statement in every artefact is linked to a claim, every claim to a verbatim quote, page and bounding box in the source, and nothing is exported until a person approves the exact version.

## Quick start

Requirements: Python 3.10+, Node.js 20+.

```bash
cp .env.example .env        # add GROQ_API_KEY (free), or HF_TOKEN / MODEL_GATEWAY_URL
./run.sh                    # venv + pip + web build, serves http://127.0.0.1:8000
```

Development (hot reload): `uvicorn app.main:app --reload --port 8000` and `cd web && npm run dev` (Vite on :5173 proxies `/api`).

## 2-minute demo

1. **Dashboard** → click the demo source `Security_Assessment_Report.pdf` (fictional, 8 pages).
2. Keep *Senior Officials · Formal · English · Medium · Inform · Mixed*; type “Generate an executive summary, advisory, infographic and presentation.” → **Transform**.
3. Watch the orchestrator plan, the agents run in parallel and the task panel update (same server state).
4. Open **Executive Summary** → click an underlined sentence → *Why did the AI say this?*: claim, source, **page 7 with the evidence box**, checks.
5. `⋯` → **Inject test conflict (demo)** on the Presentation → the Consistency Agent raises **CLAIM CONFLICT DETECTED** → **Regenerate dependents**.
6. **Security** tab: PII, a credential, internal infrastructure, markings and the **prompt injection** on page 8 (ignored, removed from model context).
7. Approve the artefact → **Provenance** tab / **Audit Logs**: hash-chained ledger entries.
8. Optional: add `Field_Office_Incident_Note.txt` as a second source → **SOURCE CONFLICT · UNRESOLVED** (14 vs 15 September) until a human decides.

## What is real

| Capability | Implementation |
|---|---|
| Generation | Live LLM calls (Hugging Face Inference Providers or a self-hosted OpenAI-compatible gateway). Model list is routed in order; on failure the run falls back to an offline extractive engine **and says so** on the task, the artefact and a workspace banner. |
| Evidence state | LLM proposes facts + quotes; `app/evidence.py` earns each claim's status by finding the quote in the source, maps it to a real PDF page (page offsets) and a pdfium bounding box, reads certainty from the source sentence, merges sources and records conflicts. |
| Verification | `app/verify.py` links every sentence to claims, normalises dates/numbers, detects drift, unsupported figures, uncertainty strengthening and cross-output conflicts. Deterministic. |
| Security | `app/security.py` detectors + audience/classification policy (ALLOW / MASK / REDACT / RESTRICT / REVIEW / BLOCK). Released versions are what export produces. Injection text and credentials are removed from model context. |
| Approval | Enforced server-side: export returns 403 until the current version is approved; stale, blocked or failing artefacts cannot be approved. |
| Provenance | `app/ledger.py`: append-only hash chain (hashes and metadata only, never content) + audit log. No external blockchain anchoring is configured. |
| Dependency-aware regeneration | Correcting a claim marks only the artefacts that state it; only those are regenerated. |
| Transform-Bench | Metrics computed from local runs, labelled “Demo evaluation”; “Not evaluated” when there is no data. |

## Configuration

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | **Recommended.** GroqCloud key: text agents run on `openai/gpt-oss-120b` (overflow to `gpt-oss-20b`), speech on Whisper. Free tier ≈1,000 requests/day and 8k tokens/min per model; the engine honours retry-after and overflows between models. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Enables the **Visual Agent**: illustrations for LinkedIn, Presentation and Video artefacts via Workers AI FLUX.1 [schnell]. An art-director step turns each slide topic into a wordless photographic scene; prompts are scrubbed of sensitive data and figures; images are labelled, hashed into the ledger and embedded in PPTX exports. |
| `HF_TOKEN` | Hugging Face token with *Make calls to Inference Providers*. Free accounts have a small monthly credit; HTTP 402 means it is used up. |
| `HF_TEXT_MODEL` | Comma-separated text models, tried in order |
| `HF_VISION_MODEL`, `HF_ASR_MODEL` | Perception for images/scans/video and speech |
| `MODEL_GATEWAY_URL` | Self-hosted OpenAI-compatible endpoint (vLLM/TGI/LiteLLM) → deployment shows **On-Prem** |
| `PRAMAAN_MAX_UPLOAD_MB`, `PRAMAAN_MAX_PARALLEL` | Limits |

Secrets live only in `.env` (git-ignored) on the server; nothing is sent to the browser.

## Deploy

PRAMAAN runs agents in the background and keeps live state in memory, so it needs a **long-running container with one replica** and a persistent volume. Railway or Render work; serverless platforms (e.g. Vercel functions) do not.

```bash
railway login
railway init -n pramaan
railway up --detach                                   # builds the Dockerfile
railway volume add --mount-path /data                 # evidence, audit log, ledger
railway variables --set HF_TOKEN=... --set PRAMAAN_ACCESS_PASSWORD=...
railway domain                                        # public URL
```

Render: `render.yaml` is a ready Blueprint (Docker, 1 instance). It defaults to the **free** plan: no persistent disk (data resets on restart) and the instance sleeps after 15 minutes idle. Switch to `plan: starter` and enable the disk block for persistence. Set `HF_TOKEN` and `PRAMAAN_ACCESS_PASSWORD` when applying the Blueprint.

**Always set `PRAMAAN_ACCESS_PASSWORD` on a public URL.** Visitors get a PRAMAAN sign-in screen; a correct password issues a signed, HttpOnly session cookie (12 h) and every `/api` route requires it. Without it anyone with the link can upload documents and spend your model credits. API tools can also send the password as HTTP Basic credentials.

## Layout

```
app/
  main.py           HTTP API + SPA host
  orchestrator.py   Centralised transformation state, task graph, agents, repair loop, approvals
  evidence.py       Canonical claim ledger: locate, page, bbox, modality, source conflicts
  verify.py         Claim linking, drift, unsupported, uncertainty, consistency, red team
  security.py       Detectors, audience policy, released versions, injection defence
  ledger.py         Audit log + hash-chained provenance ledger
  registry.py       Agents, model router, templates, connectors, Transform-Bench
  hf_engine.py      Model gateway client (HF Inference Providers / OpenAI-compatible)
  ingest.py         PDF (with page map), DOCX, PPTX, HTML, text, URL, media
  perception.py     Vision / speech for non-text sources
  exporters.py      MD, TXT, DOCX, PPTX, SVG, SRT, JSON, approved bundle
web/                React 19 + TypeScript (strict) + Tailwind 4, JetBrains Mono
samples/demo/       Fictional demo sources (scripts/build_demo_sources.py)
docs/ARCHITECTURE.md
```

API reference: `http://127.0.0.1:8000/docs`.

Built for Smart India Hackathon problem statement SIH26154. All demo content is fictional.
