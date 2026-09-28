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

# Demo mode runs the full pipeline with a deterministic offline engine, so the
# dashboard can be explored without a token. It is enabled automatically when no
# token is configured, or explicitly with PRAMAAN_DEMO_MODE=1.
DEMO_MODE = (not HF_TOKEN and not MODEL_GATEWAY_URL) or os.getenv("PRAMAAN_DEMO_MODE", "0") == "1"

# Access gate for any non-local deployment: HTTP Basic auth (any username, this password).
ACCESS_PASSWORD = os.getenv("PRAMAAN_ACCESS_PASSWORD", "").strip()

MAX_UPLOAD_MB = int(os.getenv("PRAMAAN_MAX_UPLOAD_MB", "50"))
# Open models have smaller context windows than frontier APIs; keep sources to a safe size.
MAX_SOURCE_CHARS = int(os.getenv("PRAMAAN_MAX_SOURCE_CHARS", "60000"))
MAX_PARALLEL_AGENTS = int(os.getenv("PRAMAAN_MAX_PARALLEL", "4"))

DATA_DIR = Path(os.getenv("PRAMAAN_DATA_DIR", BASE_DIR / "data"))
JOBS_DIR = DATA_DIR / "transformations"
JOBS_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_FILE = DATA_DIR / "audit.jsonl"
LEDGER_FILE = DATA_DIR / "ledger.jsonl"
SETTINGS_FILE = DATA_DIR / "settings.json"
WEB_DIST = BASE_DIR / "web" / "dist"
SAMPLES_DIR = BASE_DIR / "samples"
