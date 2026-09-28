"""Runtime configuration for PRAMAAN.

Everything is read from environment variables (optionally via a local .env file).
The Hugging Face token is never hard-coded and never written to disk by the app.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

APP_NAME = "PRAMAAN"
APP_DESCRIPTOR = "AI Transformation Workspace"
APP_VERSION = "2.0.0"


def _list(name: str, default: str) -> list[str]:
    return [m.strip() for m in os.getenv(name, default).split(",") if m.strip()]


HF_TOKEN = (os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN") or "").strip()
# "auto" lets Hugging Face Inference Providers route to the first available provider for the model.
HF_PROVIDER = os.getenv("HF_PROVIDER", "auto").strip()
# Text generation (analysis + all deliverables). Tried in order when a model is unavailable or overloaded.
HF_TEXT_MODELS = _list("HF_TEXT_MODEL", "meta-llama/Llama-3.3-70B-Instruct,Qwen/Qwen2.5-72B-Instruct,meta-llama/Llama-3.1-8B-Instruct")
# Perception: images, scanned PDF pages and video keyframes.
HF_VISION_MODELS = _list("HF_VISION_MODEL", "Qwen/Qwen2.5-VL-72B-Instruct,Qwen/Qwen2.5-VL-7B-Instruct")
# Perception: speech in audio and video.
HF_ASR_MODEL = os.getenv("HF_ASR_MODEL", "openai/whisper-large-v3").strip()
HF_MAX_TOKENS = int(os.getenv("HF_MAX_TOKENS", "6000"))
# Optional OpenAI-compatible model gateway (e.g. a self-hosted vLLM / TGI / LiteLLM endpoint).
# When set, all model calls go to this endpoint instead of Hugging Face Inference Providers.
MODEL_GATEWAY_URL = os.getenv("MODEL_GATEWAY_URL", "").strip()

# GroqCloud (OpenAI-compatible). Generous free tier: per-model daily request and per-minute token budgets.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip()
GROQ_TEXT_MODELS = _list("GROQ_TEXT_MODEL", "openai/gpt-oss-120b,openai/gpt-oss-20b")
GROQ_ASR_MODEL = os.getenv("GROQ_ASR_MODEL", "whisper-large-v3-turbo").strip()
GROQ_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "3500"))

# Image generation (Visual Agent) via Cloudflare Workers AI.
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell").strip()

# Video production: Cloudflare Aura-2 narration; optional real motion clips via Pollinations (Nova Reel).
TTS_MODEL = os.getenv("TTS_MODEL", "@cf/deepgram/aura-2-en").strip()
TTS_VOICE = os.getenv("TTS_VOICE", "").strip()
POLLINATIONS_API_KEY = os.getenv("POLLINATIONS_API_KEY", "").strip()
VIDEO_MODEL = os.getenv("VIDEO_MODEL", "amazon/nova-reel-v1").strip()
VIDEO_TIMEOUT_S = int(os.getenv("VIDEO_TIMEOUT_S", "240"))
# Clip length requested per scene (Nova Reel's minimum is 6 s; most other models max out at 5 s).
# JSON2Video cloud renderer (preferred when set): AI images, Azure neural voices (incl. Indian languages), subtitles.
JSON2VIDEO_API_KEY = os.getenv("JSON2VIDEO_API_KEY", "").strip()
J2V_IMAGE_MODEL = os.getenv("J2V_IMAGE_MODEL", "flux-schnell").strip()
J2V_VOICE = os.getenv("J2V_VOICE", "").strip()
J2V_TIMEOUT_S = int(os.getenv("J2V_TIMEOUT_S", "600"))

# How many scenes per video get a real motion clip (the rest are animated stills). Nova Reel is on
# Pollinations' free "Quest" tier at ~0.48 pollen per clip, so one hero clip keeps a video affordable.
VIDEO_MOTION_MAX = int(os.getenv("VIDEO_MOTION_MAX", "1"))
VIDEO_CLIP_SECONDS = int(os.getenv("VIDEO_CLIP_SECONDS", "6" if "nova-reel" in VIDEO_MODEL else "5"))

# Which text engine to use: auto (Groq > self-hosted gateway > Hugging Face), or force one.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").strip().lower()
if LLM_PROVIDER == "auto":
    LLM_PROVIDER = "groq" if GROQ_API_KEY else ("gateway" if MODEL_GATEWAY_URL else ("huggingface" if HF_TOKEN else "offline"))

# Demo mode runs the full pipeline with a deterministic offline engine, so the
# dashboard can be explored without a token. It is enabled automatically when no
# token is configured, or explicitly with PRAMAAN_DEMO_MODE=1.
DEMO_MODE = LLM_PROVIDER == "offline" or os.getenv("PRAMAAN_DEMO_MODE", "0") == "1"

# Access gate for any non-local deployment: HTTP Basic auth (any username, this password).
ACCESS_PASSWORD = os.getenv("PRAMAAN_ACCESS_PASSWORD", "").strip()

MAX_UPLOAD_MB = int(os.getenv("PRAMAAN_MAX_UPLOAD_MB", "50"))
# Open models have smaller context windows than frontier APIs; keep sources to a safe size.
MAX_SOURCE_CHARS = int(os.getenv("PRAMAAN_MAX_SOURCE_CHARS", "60000"))
# Groq's free tier has small per-minute token budgets, so run fewer agents at once there.
MAX_PARALLEL_AGENTS = int(os.getenv("PRAMAAN_MAX_PARALLEL", "2" if LLM_PROVIDER == "groq" else "4"))
# Writers work from the evidence ledger; they only need a source excerpt for wording and context.
WRITER_SOURCE_CHARS = int(os.getenv("PRAMAAN_WRITER_SOURCE_CHARS", "6000" if LLM_PROVIDER == "groq" else "24000"))

DATA_DIR = Path(os.getenv("PRAMAAN_DATA_DIR", BASE_DIR / "data"))
JOBS_DIR = DATA_DIR / "transformations"
JOBS_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_FILE = DATA_DIR / "audit.jsonl"
LEDGER_FILE = DATA_DIR / "ledger.jsonl"
SETTINGS_FILE = DATA_DIR / "settings.json"
WEB_DIST = BASE_DIR / "web" / "dist"
SAMPLES_DIR = BASE_DIR / "samples"
