"""OpenAI-compatible chat engine, used for both OpenAI and GroqCloud.

One class, two configurations:
  * OpenAI (billed per use): GPT-5-family text + native vision + transcription; falls back to Groq when
    the account runs out of quota or every OpenAI model fails, so a live session never stops.
  * Groq (free tier): per-model tokens-per-minute budgets, so it overflows to the next model when
    throttled and honours retry-after hints instead of blind backoff.

Models differ in which parameters they accept (GPT-5 reasoning models only allow the default temperature;
non-reasoning models reject reasoning_effort). Rather than special-casing model names, a parameter the
API reports as unsupported is dropped for that model and the call is retried.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re

import httpx

from . import config
from .hf_engine import EngineError, HFEngine
from .schema_tools import coerce, parse_json, skeleton_text

log = logging.getLogger("pramaan.chat")
WAIT_RX = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s", re.I)


def _retry_after(resp: httpx.Response) -> float:
    try:
        return float(resp.headers.get("retry-after", ""))
    except ValueError:
        m = WAIT_RX.search(resp.text)
        return (int(m.group(1) or 0) * 60 + float(m.group(2))) if m else 5.0


def _error(resp: httpx.Response) -> dict:
    try:
        return resp.json().get("error") or {}
    except ValueError:
        return {}


class ChatEngine:
    def __init__(self, mode: str, label: str, base: str, key: str, models: list[str], max_tokens: int,
                 asr_model: str, vision_model: str | None = None, fallback: "ChatEngine | None" = None) -> None:
        self.mode, self.label = mode, label
        self.models = models
        self.model = models[0]
        self.base = base.rstrip("/")
        self.headers = {"Authorization": f"Bearer {key}"}
        self.max_tokens = max_tokens
        self.asr_model = asr_model
        self.vision_model = vision_model
        self.fallback = fallback
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15))
        self.hf_vision = HFEngine() if (not vision_model and config.HF_TOKEN) else None
        self.dropped: dict[str, set[str]] = {}  # model -> parameters it rejected

    async def _chat(self, messages: list[dict], temperature: float, response_format: dict | None,
                    max_tokens: int, models: list[str] | None = None) -> tuple[str, dict]:
        last = "no model attempted"
        for model in models or self.models:
            use_schema = response_format is not None
            for attempt in range(6):
                body: dict = {"model": model, "messages": messages, "temperature": temperature,
                              "max_completion_tokens": max_tokens, "reasoning_effort": "low"}
                if use_schema:
                    body["response_format"] = response_format
                for p in self.dropped.get(model, ()):
                    body.pop(p, None)
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
                text, err = r.text[:400], _error(r)
                last = f"{model}: HTTP {r.status_code} {(err.get('message') or text)[:160]}"
                log.warning("%s %s attempt %d failed: %s %s", self.label, model, attempt + 1, r.status_code, text[:200])
                if r.status_code in (401, 403):
                    raise EngineError(f"{self.label} rejected the API key.")
                if r.status_code == 400 and err.get("param") in ("temperature", "reasoning_effort", "max_completion_tokens"):
                    self.dropped.setdefault(model, set()).add(err["param"])
                    continue
                if r.status_code == 400 and use_schema:
                    use_schema = False  # schema rejected or generation failed validation: fall back to prompt JSON
                    continue
                if r.status_code == 429 and err.get("code") == "insufficient_quota":
                    raise EngineError(f"{self.label} account has no remaining quota.")
                if r.status_code == 413 or "request too large" in text.lower():
                    break  # cannot fit this model's per-minute budget; try the next model
                if r.status_code == 429:
                    wait = _retry_after(r)
                    if "per day" in text.lower() or wait > 25:
                        break  # daily quota or long wait: overflow to the next model
                    await asyncio.sleep(wait + 0.5)
                    continue
                if r.status_code >= 500:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                break
        raise EngineError(f"All {self.label} models failed. Last error: {last}")

    async def generate_json(self, system: str, user: str, schema: dict, temperature: float = 0.4) -> tuple[dict, dict]:
        try:
            return await self._generate_json(system, user, schema, temperature)
        except EngineError as e:
            if not self.fallback:
                raise
            log.warning("%s failed (%s); falling back to %s", self.label, e, self.fallback.label)
            return await self.fallback.generate_json(system, user, schema, temperature)

    async def _generate_json(self, system: str, user: str, schema: dict, temperature: float) -> tuple[dict, dict]:
        user = (f"{user}\n\nRESPONSE FORMAT\nReply with ONE JSON object only (no markdown, no commentary) "
                f"with exactly this structure:\n{skeleton_text(schema)}")
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        rf = {"type": "json_schema", "json_schema": {"name": "structured_output", "schema": schema, "strict": False}}
        for attempt in range(2):
            text, usage = await self._chat(messages, temperature, rf, self.max_tokens)
            try:
                return coerce(schema, parse_json(text)), usage
            except (json.JSONDecodeError, ValueError):
                log.warning("Unparsable JSON from %s (attempt %d)", usage.get("model"), attempt + 1)
                messages = messages + [{"role": "assistant", "content": text[:4000]},
                                       {"role": "user", "content": "That was not valid JSON. Return only the corrected JSON object."}]
                rf = None
        raise EngineError("The model did not return valid JSON after a repair attempt.")

    @property
    def has_vision(self) -> bool:
        return bool(self.vision_model or self.hf_vision)

    async def describe_images(self, images: list[tuple[bytes, str]], instruction: str) -> tuple[str, dict]:
        if self.vision_model:
            content: list[dict] = [{"type": "text", "text": instruction}]
            for data, mime in images[:8]:
                content.append({"type": "image_url",
                                "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}})
            return await self._chat([{"role": "user", "content": content}], 0.1, None, 6000, [self.vision_model])
        if self.hf_vision:
            return await self.hf_vision.describe_images(images, instruction)
        raise EngineError("No vision model is configured. Images and scanned PDFs need OPENAI_API_KEY, HF_TOKEN "
                          "(with credits) or a vision-capable gateway; text documents work without it.")

    async def transcribe(self, audio: bytes) -> str:
        files = {"file": ("audio.wav", audio, "audio/wav")}
        data = {"model": self.asr_model, "response_format": "json"}
        try:
            r = await self.client.post(f"{self.base}/audio/transcriptions", files=files, data=data, headers=self.headers)
        except httpx.HTTPError as e:
            raise EngineError(f"Speech transcription failed: {e}") from e
        if r.status_code != 200:
            if self.fallback:
                return await self.fallback.transcribe(audio)
            raise EngineError(f"Speech transcription failed: HTTP {r.status_code} {r.text[:160]}")
        return (r.json().get("text") or "").strip()


def groq_engine() -> ChatEngine:
    return ChatEngine("groq", "GroqCloud", config.GROQ_BASE_URL, config.GROQ_API_KEY, config.GROQ_TEXT_MODELS,
                      config.GROQ_MAX_TOKENS, config.GROQ_ASR_MODEL)


def openai_engine() -> ChatEngine:
    return ChatEngine("openai", "OpenAI", config.OPENAI_BASE_URL, config.OPENAI_API_KEY, config.OPENAI_TEXT_MODELS,
                      config.OPENAI_MAX_TOKENS, config.OPENAI_ASR_MODEL, vision_model=config.OPENAI_VISION_MODEL,
                      fallback=groq_engine() if config.GROQ_API_KEY else None)
