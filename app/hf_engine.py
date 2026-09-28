"""Hugging Face Inference Providers engine.

- Text agents: chat-completion on an open instruct model (default Llama 3.3 70B Instruct)
  with JSON-schema constrained output where the provider supports it, and a prompt-level
  schema + parser + coercion path where it does not.
- Perception: a vision-language model (Qwen2.5-VL) reads images, scanned PDF pages and video
  keyframes; Whisper transcribes speech in audio and video.
- Resilience: retries with backoff on 429/5xx and falls through a model list when a model
  is unavailable for the account or provider.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging

from huggingface_hub import AsyncInferenceClient

from . import config
from .schema_tools import coerce, parse_json, skeleton_text

log = logging.getLogger("pramaan.hf")

TRANSIENT = {408, 425, 429, 500, 502, 503, 504}


class EngineError(RuntimeError):
    pass


def _status(e: Exception) -> int | None:
    resp = getattr(e, "response", None)
    return getattr(resp, "status_code", None)


def _friendly(e: Exception | None) -> str:
    if e is None:
        return "unknown error"
    code = _status(e)
    msg = str(e).split("\n")[0][:260]
    if code == 401:
        return "Hugging Face rejected the token (401). Check HF_TOKEN."
    if code == 403:
        return "The token lacks permission for Inference Providers (403). Enable 'Make calls to Inference Providers'."
    if code == 402:
        return "Hugging Face inference credits are exhausted for this account (402)."
    return msg


class HFEngine:
    mode = "huggingface"

    def __init__(self) -> None:
        if config.MODEL_GATEWAY_URL:
            # self-hosted OpenAI-compatible gateway (vLLM / TGI / LiteLLM); keeps inference on-prem
            self.client = AsyncInferenceClient(base_url=config.MODEL_GATEWAY_URL, api_key=config.HF_TOKEN or "none", timeout=180)
            self.mode = "gateway"
        else:
            self.client = AsyncInferenceClient(provider=config.HF_PROVIDER, token=config.HF_TOKEN, timeout=180)
        self.text_models = config.HF_TEXT_MODELS
        self.vision_models = config.HF_VISION_MODELS
        self.model = self.text_models[0]

    async def _chat(self, models: list[str], messages: list[dict], **kw) -> tuple[str, dict]:
        last: Exception | None = None
        for model in models:
            use_schema = "response_format" in kw
            for attempt in range(3):
                args = dict(kw)
                if not use_schema:
                    args.pop("response_format", None)
                try:
                    out = await self.client.chat_completion(messages=messages, model=model, **args)
                    text = out.choices[0].message.content or ""
                    u = out.usage
                    usage = {"model": model, "input_tokens": getattr(u, "prompt_tokens", 0) or 0,
                             "output_tokens": getattr(u, "completion_tokens", 0) or 0}
                    return text, usage
                except Exception as e:  # noqa: BLE001 - huggingface_hub raises several error types
                    last = e
                    code = _status(e)
                    text = str(e).lower()
                    log.warning("HF %s attempt %d failed: %s %s", model, attempt + 1, code, str(e)[:200])
                    if code in (401, 403):
                        raise EngineError(_friendly(e)) from e
                    if code == 402:
                        break  # credits: a smaller model later in the list may still be affordable
                    if use_schema and (code in (400, 422) or "response_format" in text or "json_schema" in text):
                        use_schema = False  # provider does not support constrained decoding
                        continue
                    if code in TRANSIENT or "timeout" in text or "timed out" in text:
                        await asyncio.sleep(2 * (2 ** attempt))
                        continue
                    break  # 404 / model not supported by any provider -> next model
        raise EngineError(f"All Hugging Face models failed. Last error: {_friendly(last)}")

    async def generate_json(self, system: str, user: str, schema: dict, temperature: float = 0.6) -> tuple[dict, dict]:
        user = (f"{user}\n\nRESPONSE FORMAT\nReply with ONE JSON object only (no markdown, no commentary) "
                f"with exactly this structure:\n{skeleton_text(schema)}")
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        rf = {"type": "json_schema", "json_schema": {"name": "structured_output", "schema": schema, "strict": False}}
        for attempt in range(2):
            text, usage = await self._chat(self.text_models, messages, response_format=rf,
                                           temperature=temperature, max_tokens=config.HF_MAX_TOKENS)
            try:
                return coerce(schema, parse_json(text)), usage
            except (json.JSONDecodeError, ValueError):
                log.warning("Unparsable JSON from %s (attempt %d)", usage.get("model"), attempt + 1)
                messages = messages + [{"role": "assistant", "content": text[:4000]},
                                       {"role": "user", "content": "That was not valid JSON. Return only the corrected JSON object."}]
        raise EngineError("The model did not return valid JSON after a repair attempt.")

    async def describe_images(self, images: list[tuple[bytes, str]], instruction: str) -> tuple[str, dict]:
        content: list[dict] = [{"type": "text", "text": instruction}]
        for data, mime in images[:8]:
            url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
            content.append({"type": "image_url", "image_url": {"url": url}})
        return await self._chat(self.vision_models, [{"role": "user", "content": content}],
                                temperature=0.1, max_tokens=2500)

    async def transcribe(self, audio: bytes) -> str:
        try:
            out = await self.client.automatic_speech_recognition(audio, model=config.HF_ASR_MODEL)
            return (out.text or "").strip()
        except Exception as e:  # noqa: BLE001
            raise EngineError(f"Speech transcription failed: {_friendly(e)}") from e
