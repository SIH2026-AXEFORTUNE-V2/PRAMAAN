"""Helpers that make open-model JSON output dependable.

Not every Hugging Face provider enforces JSON schemas, so PRAMAAN (1) shows the model a
compact skeleton of the expected JSON, and (2) coerces whatever comes back into the schema:
missing fields get typed defaults, numbers given as strings are converted, enums are
snapped to an allowed value and arrays are trimmed to their maximum length.
"""
from __future__ import annotations

import json
import re


def skeleton(schema: dict):
    """Example-shaped JSON (with type hints) used inside the prompt."""
    t = schema.get("type")
    if t == "object":
        return {k: skeleton(v) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        return [skeleton(schema["items"])]
    if "enum" in schema:
        return " | ".join(schema["enum"])
    hint = {"string": "string", "number": 0.0, "integer": 0}.get(t, "string")
    desc = schema.get("description")
    if t == "string" and desc:
        return f"string: {desc}"
    return hint


def skeleton_text(schema: dict) -> str:
    return json.dumps(skeleton(schema), ensure_ascii=False, indent=1)


def _num(v, integer: bool):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(round(v)) if integer else float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v or "").replace(",", ""))
    if not m:
        return 0
    return int(round(float(m.group()))) if integer else float(m.group())


def coerce(schema: dict, value):
    t = schema.get("type")
    if t == "object":
        value = value if isinstance(value, dict) else {}
        return {k: coerce(sub, value.get(k)) for k, sub in schema.get("properties", {}).items()}
    if t == "array":
        if isinstance(value, (str, dict)) and value:
            value = [value]
        items = [coerce(schema["items"], v) for v in (value if isinstance(value, list) else [])]
        if schema["items"].get("type") == "string":
            items = [i for i in items if i.strip()]
        if "maxItems" in schema:
            items = items[: schema["maxItems"]]
        return items
    if t in ("number", "integer"):
        return _num(value, t == "integer")
    # string
    if value is None:
        value = ""
    if isinstance(value, (list, dict)):
        value = json.dumps(value, ensure_ascii=False) if isinstance(value, dict) else "; ".join(map(str, value))
    value = str(value).strip()
    if "enum" in schema:
        low = value.lower().replace(" ", "_").replace("-", "_")
        for opt in schema["enum"]:
            if low == opt.lower().replace("-", "_") or low == opt.lower():
                return opt
        for opt in schema["enum"]:
            if opt.lower().split(":")[-1] in low:
                return opt
        return schema["enum"][0]
    return value


def parse_json(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^<think>.*?</think>", "", text, flags=re.S).strip()  # reasoning models
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            chunk = text[start:end + 1]
            try:
                return json.loads(chunk)
            except json.JSONDecodeError:
                return json.loads(re.sub(r",\s*([}\]])", r"\1", chunk))  # trailing commas
        raise
