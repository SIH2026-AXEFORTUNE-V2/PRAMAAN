"""Audit log and provenance ledger.

audit.jsonl   operational audit trail (who did what, when, to which object)
ledger.jsonl  append-only, hash-chained provenance ledger. Each entry stores only hashes and
              metadata (never source content), and carries the hash of the previous entry, so any
              tampering breaks the chain. Entries are shaped so they can later be anchored to an
              external blockchain / notarisation service; no external anchoring is configured here.
"""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone

from . import config

_lock = threading.Lock()
AUDIT: list[dict] = []
LEDGER: list[dict] = []
GENESIS = "0" * 64


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def canonical_hash(obj) -> str:
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def load() -> None:
    for path, target in ((config.AUDIT_FILE, AUDIT), (config.LEDGER_FILE, LEDGER)):
        target.clear()
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    target.append(json.loads(line))
                except json.JSONDecodeError:
                    continue


def _append(path, entry: dict) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def audit(action: str, obj: str, *, actor: str = "System", actor_type: str = "system", status: str = "success",
          transformation_id: str | None = None, detail: str = "") -> dict:
    with _lock:
        entry = {"id": f"EVT-{len(AUDIT) + 1:06d}", "ts": now(), "actor": actor, "actor_type": actor_type,
                 "action": action, "object": obj, "status": status, "transformation_id": transformation_id,
                 "detail": detail[:500]}
        AUDIT.append(entry)
        _append(config.AUDIT_FILE, entry)
        return entry


def record(kind: str, transformation_id: str, payload: dict, actor: str = "Provenance Agent") -> dict:
    """Append a hash-chained provenance entry. payload must contain hashes / metadata only."""
    with _lock:
        prev = LEDGER[-1]["entry_hash"] if LEDGER else GENESIS
        entry = {"index": len(LEDGER), "ts": now(), "kind": kind, "transformation_id": transformation_id,
                 "actor": actor, "payload": payload, "prev_hash": prev}
        entry["entry_hash"] = canonical_hash(entry)
        LEDGER.append(entry)
        _append(config.LEDGER_FILE, entry)
        return entry


def verify_chain() -> dict:
    prev = GENESIS
    for e in LEDGER:
        body = {k: v for k, v in e.items() if k != "entry_hash"}
        if e["prev_hash"] != prev or canonical_hash(body) != e["entry_hash"]:
            return {"valid": False, "entries": len(LEDGER), "broken_at": e["index"], "head": prev}
        prev = e["entry_hash"]
    return {"valid": True, "entries": len(LEDGER), "broken_at": None, "head": prev}
