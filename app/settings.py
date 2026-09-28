"""Workspace settings, persisted to data/settings.json."""
from __future__ import annotations

import json

from . import config

DEFAULTS: dict = {
    "workspace_name": "Security Communications",
    "operator_name": "Operator",
    "operator_role": "Analyst & Approver",
    "default_classification": "Internal",
    "neutralise_injection": True,           # remove embedded instructions from model context
    "withhold_credentials": True,           # never send detected credentials to the model gateway
    "require_approval_for_export": True,    # enforced server-side; cannot be disabled in this build
    "retention_days": 90,
    "notify_on_review": True,
    "notify_on_failure": True,
    "notify_on_security": True,
    "audit_page_size": 50,
}
LOCKED = {"require_approval_for_export"}
_state: dict = {}


def load() -> dict:
    _state.clear()
    _state.update(DEFAULTS)
    if config.SETTINGS_FILE.exists():
        try:
            saved = json.loads(config.SETTINGS_FILE.read_text(encoding="utf-8"))
            _state.update({k: v for k, v in saved.items() if k in DEFAULTS and k not in LOCKED})
        except (OSError, json.JSONDecodeError):
            pass
    return _state


def get() -> dict:
    return _state or load()


def update(changes: dict) -> dict:
    cur = get()
    for k, v in changes.items():
        if k not in DEFAULTS or k in LOCKED:
            continue
        default = DEFAULTS[k]
        if isinstance(default, bool):
            cur[k] = bool(v)
        elif isinstance(default, int):
            try:
                cur[k] = max(1, min(int(v), 3650))
            except (TypeError, ValueError):
                continue
        else:
            cur[k] = str(v).strip()[:80] or default
    config.SETTINGS_FILE.write_text(json.dumps(cur, indent=1), encoding="utf-8")
    return cur


def operator() -> str:
    return get()["operator_name"]
