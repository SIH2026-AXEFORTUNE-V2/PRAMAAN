"""Groq engine: OpenAI-compatible chat completions + Whisper transcription on GroqCloud.

Free-tier aware. Each model has its own tokens-per-minute budget, so the engine:
  * prefers the strongest model and overflows to the next one when throttled,
  * honours Groq's retry-after hints instead of blind backoff,
  * asks reasoning models for low reasoning effort (reasoning tokens count against the budget),
  * drops structured-output mode for a model that rejects the schema, then repairs JSON itself.
Groq exposes no vision model on the free key tested, so images / scanned PDFs are delegated to the
Hugging Face engine when HF_TOKEN is configured.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

from . import config
from .hf_engine import EngineError, HFEngine
from .schema_tools import coerce, parse_json, skeleton_text

log = logging.getLogger("pramaan.groq")
WAIT_RX = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s", re.I)


def _retry_after(resp: httpx.Response) -> float:
    try:
        return float(resp.headers.get("retry-after", ""))
    except ValueError:
        m = WAIT_RX.search(resp.text)
        return (int(m.group(1) or 0) * 60 + float(m.group(2))) if m else 5.0


class GroqEngine:
    mode = "groq"

    def __init__(self) -> None:
        self.models = config.GROQ_TEXT_MODELS
        self.model = self.models[0]
        self.base = config.GROQ_BASE_URL.rstrip("/")
        self.headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}"}
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(150, connect=15))
        self.vision = HFEngine() if config.HF_TOKEN else None

    async def _chat(self, messages: list[dict], temperature: float, response_format: dict | None,
                    max_tokens: int) -> tuple[str, dict]:
        last = "no model attempted"
        for model in self.models:
            use_schema = response_format is not None
            for attempt in range(5):
                body: dict = {"model": model, "messages": messages, "temperature": temperature,
                              "max_completion_tokens": max_tokens}
                if model.startswith("openai/gpt-oss"):
                    body["reasoning_effort"] = "low"
                if use_schema:
                    body["response_format"] = response_format
                try:
                    r = await self.client.post(f"{self.base}/chat/completions", json=body, headers=self.headers)
                except httpx.HTTPError as e:
                    last = f"network error: {e}"
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                if r.status_code == 200:
                    data = r.json()
                    u = data.get("usage") or {}
                    return (data["choices"][0]["message"].get("content") or "",
                            {"model": model, "input_tokens": u.get("prompt_tokens", 0),
                             "output_tokens": u.get("completion_tokens", 0)})
                text = r.text[:400]
                last = f"{model}: HTTP {r.status_code} {text[:160]}"
                log.warning("Groq %s attempt %d failed: %s %s", model, attempt + 1, r.status_code, text[:200])
                if r.status_code in (401, 403):
                    raise EngineError("Groq rejected the API key (check GROQ_API_KEY).")
                if r.status_code == 413 or "request too large" in text.lower():
                    break  # this request cannot fit this model's per-minute budget; try the next model
                if r.status_code == 429:
                    wait = _retry_after(r)
                    if "per day" in text.lower() or wait > 25:
                        break  # daily quota or long wait: overflow to the next model
                    await asyncio.sleep(wait + 0.5)
                    continue
                if r.status_code == 400 and use_schema:
                    use_schema = False  # schema rejected or generation failed validation: fall back to prompt JSON
                    continue
                if r.status_code >= 500:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                break
        raise EngineError(f"All Groq models failed. Last error: {last}")

    async def generate_json(self, system: str, user: str, schema: dict, temperature: float = 0.4) -> tuple[dict, dict]:
        user = (f"{user}\n\nRESPONSE FORMAT\nReply with ONE JSON object only (no markdown, no commentary) "
                f"with exactly this structure:\n{skeleton_text(schema)}")
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        rf = {"type": "json_schema", "json_schema": {"name": "structured_output", "schema": schema, "strict": False}}
        for attempt in range(2):
            text, usage = await self._chat(messages, temperature, rf, config.GROQ_MAX_TOKENS)
            try:
                return coerce(schema, parse_json(text)), usage
            except (json.JSONDecodeError, ValueError):
                log.warning("Unparsable JSON from %s (attempt %d)", usage.get("model"), attempt + 1)
                messages = messages + [{"role": "assistant", "content": text[:4000]},
                                       {"role": "user", "content": "That was not valid JSON. Return only the corrected JSON object."}]
                rf = None
        raise EngineError("The model did not return valid JSON after a repair attempt.")

    async def describe_images(self, images: list[tuple[bytes, str]], instruction: str) -> tuple[str, dict]:
        if not self.vision:
            raise EngineError("No vision model is configured. Images and scanned PDFs need HF_TOKEN (with credits) "
                              "or a vision-capable gateway; text documents work without it.")
        return await self.vision.describe_images(images, instruction)

    async def transcribe(self, audio: bytes) -> str:
        files = {"file": ("audio.wav", audio, "audio/wav")}
        data = {"model": config.GROQ_ASR_MODEL, "response_format": "json"}
        try:
            r = await self.client.post(f"{self.base}/audio/transcriptions", files=files, data=data, headers=self.headers)
        except httpx.HTTPError as e:
            raise EngineError(f"Speech transcription failed: {e}") from e
        if r.status_code != 200:
            raise EngineError(f"Speech transcription failed: HTTP {r.status_code} {r.text[:160]}")
        return (r.json().get("text") or "").strip()
