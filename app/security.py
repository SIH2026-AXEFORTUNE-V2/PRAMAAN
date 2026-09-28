"""Security Agent: sensitive-data detection, audience-aware release policy and prompt-injection defence.

Deterministic detectors run on every source (before any model call) and on every generated artefact.
The release policy decides, per finding, what happens in the released version of an artefact:

    ALLOW     released unchanged
    MASK      partially masked (e.g. a****@domain, 10.20.x.x)
    REDACT    replaced with a [REDACTED: ...] marker
    RESTRICT  replaced with a generic descriptor (e.g. [internal system])
    REVIEW    released unchanged but flagged for the human reviewer
    BLOCK     the artefact cannot be approved until the content is removed

The policy depends on the artefact's exposure (public channel, leadership, technical), which is
derived from the artefact type, the audience and the security classification in the contract.
"""
from __future__ import annotations

import copy
import re

# ---------------------------------------------------------------------------
# Detectors
# ---------------------------------------------------------------------------
# (category, class, label, pattern)
DETECTORS: list[tuple[str, str, str, re.Pattern]] = [
    ("email", "pii", "Email address", re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")),
    ("phone", "pii", "Phone number", re.compile(r"(?<!\w)(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,11}\d(?!\w)")),
    ("national_id", "pii", "National ID number", re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b|\b[A-Z]{5}\d{4}[A-Z]\b")),
    ("password", "credential", "Password", re.compile(r"(?i)\b(?:password|passwd|pwd|passphrase)\s*[:=]\s*\S+")),
    ("api_key", "credential", "API key / token",
     re.compile(r"\b(?:hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b")),
    ("secret_assignment", "credential", "Secret value",
     re.compile(r"(?i)\b(?:api[_-]?key|secret|token|client[_-]?secret)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{12,}")),
    ("internal_host", "infrastructure", "Internal hostname",
     re.compile(r"\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:internal|corp|local|lan|intra)\b", re.I)),
    ("internal_ip", "infrastructure", "Internal IP address",
     re.compile(r"\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b")),
    ("asset_id", "infrastructure", "Internal asset identifier",
     re.compile(r"\bASSET-\d{3,}\b|\b[A-Z]{2,5}-(?:WS|SRV|PC|LT)-\d{2,}\b")),
    ("public_ip", "threat_indicator", "IP indicator",
     re.compile(r"\b(?!10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){3}\d{1,3}\b")),
    ("domain_indicator", "threat_indicator", "Domain indicator",
     re.compile(r"\b[a-z0-9-]+(?:\[\.\]|\.)(?:example|xyz|top|ru|cn|net|info)\b(?![\w@])", re.I)),
    ("file_hash", "threat_indicator", "File hash", re.compile(r"\b[a-fA-F0-9]{32,64}\b")),
    ("sensitive_location", "location", "Sensitive facility location",
     re.compile(r"(?i)\b(?:(?:primary|secondary|backup)\s+)?data\s+cent(?:re|er)\b[^.;\n]{0,60}|\bbuilding\s+[A-Z0-9]\b[^.;\n]{0,40}|\bserver\s+room\b")),
    ("coordinates", "location", "Geographic coordinates", re.compile(r"-?\d{1,2}\.\d{3,},\s*-?\d{1,3}\.\d{3,}")),
    ("confidential_marker", "marking", "Confidentiality marking",
     re.compile(r"\b(?:TOP\s+SECRET|CONFIDENTIAL|RESTRICTED|INTERNAL USE ONLY|TLP:(?:RED|AMBER(?:\+STRICT)?))\b")),
]

CLASS_LABEL = {
    "pii": "Personal data", "credential": "Credentials & secrets", "infrastructure": "Internal infrastructure",
    "threat_indicator": "Threat indicators", "location": "Sensitive location", "marking": "Confidential marking",
    "injection": "Untrusted instruction",
}

INJECTION_RE = re.compile(
    r"(?i)(ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|system|your)?\s*"
    r"(?:instructions|prompts?|rules|guidelines)"
    r"|\b(?:note|message|instruction)s?\s+to\s+(?:the\s+)?(?:ai|llm|assistant|language model|chatbot|summari[sz](?:ation|er)\s+tools?)\b"
    r"|\byou\s+are\s+now\s+(?:a|an|in)\b|\b(?:reveal|print|show)\s+(?:your|the)\s+system\s+prompt\b"
    r"|\bnew\s+instructions\s*:|\bact\s+as\s+(?:a|an)\s+(?:different|unrestricted)\b")


def _sentence_span(text: str, start: int, end: int) -> tuple[int, int]:
    """Expand a match to its surrounding sentence (sentences may wrap across lines)."""
    s = max(text.rfind(". ", 0, start), text.rfind(".\n", 0, start), text.rfind("\n\n", 0, start))
    s = 0 if s < 0 else s + 2
    m = re.search(r"[.!?](?:\s|$)", text[end:])
    e = end + m.end() if m else len(text)
    return s, e


def detect_injection(text: str) -> list[dict]:
    out, seen = [], set()
    for m in INJECTION_RE.finditer(text or ""):
        s, e = _sentence_span(text, m.start(), m.end())
        if (s, e) in seen:
            continue
        seen.add((s, e))
        out.append({"span": [s, e], "text": re.sub(r"\s+", " ", text[s:e]).strip(), "trigger": m.group(0),
                    "action": "IGNORE", "reason": "Instruction embedded in source content; treated as untrusted data."})
    return out


def scan_text(text: str) -> list[dict]:
    """Findings in a single string. Overlapping matches keep the earliest detector in DETECTORS order."""
    found: list[dict] = []
    taken: list[tuple[int, int]] = []
    for cat, cls, label, rx in DETECTORS:
        for m in rx.finditer(text or ""):
            a, b = m.span()
            if any(a < y and b > x for x, y in taken):
                continue
            if cat == "phone" and len(re.sub(r"\D", "", m.group())) < 10:
                continue
            taken.append((a, b))
            found.append({"category": cat, "class": cls, "label": label, "text": m.group().strip(), "span": [a, b]})
    return found


def summarise(findings: list[dict]) -> dict:
    counts = {k: 0 for k in CLASS_LABEL}
    for f in findings:
        counts[f["class"]] = counts.get(f["class"], 0) + 1
    return counts


# ---------------------------------------------------------------------------
# Exposure + policy
# ---------------------------------------------------------------------------
PUBLIC_TYPES = {"linkedin", "twitter", "video"}
PUBLIC_AUDIENCES = {"General Audience", "Public Communication"}
TECHNICAL_AUDIENCES = {"Technical Teams", "Cybersecurity Teams"}

EXPOSURE_LABEL = {"public": "Public channel", "leadership": "Internal · leadership", "technical": "Internal · technical"}

POLICY: dict[str, dict[str, str]] = {
    #                  public      leadership   technical
    "pii":              {"public": "REDACT", "leadership": "MASK", "technical": "MASK"},
    "credential":       {"public": "REDACT", "leadership": "REDACT", "technical": "REDACT"},
    "infrastructure":   {"public": "REDACT", "leadership": "RESTRICT", "technical": "ALLOW"},
    "threat_indicator": {"public": "MASK", "leadership": "ALLOW", "technical": "ALLOW"},
    "location":         {"public": "REDACT", "leadership": "MASK", "technical": "REVIEW"},
    "marking":          {"public": "BLOCK", "leadership": "REVIEW", "technical": "REVIEW"},
    "injection":        {"public": "BLOCK", "leadership": "BLOCK", "technical": "BLOCK"},
}

REASON = {
    "ALLOW": "Permitted for this audience.",
    "MASK": "Partially masked for this audience.",
    "REDACT": "Removed from the released version.",
    "RESTRICT": "Replaced with a generic description for this audience.",
    "REVIEW": "Released as-is; reviewer must confirm it is appropriate.",
    "BLOCK": "Not releasable on this channel. Edit or regenerate before approval.",
}


def exposure(otype: str, audience: str, classification: str) -> str:
    if otype in PUBLIC_TYPES or audience in PUBLIC_AUDIENCES or classification == "Public":
        return "public"
    if audience in TECHNICAL_AUDIENCES:
        return "technical"
    return "leadership"


def _mask(cat: str, text: str) -> str:
    if cat == "email":
        user, _, dom = text.partition("@")
        return f"{user[:1]}***@{dom}"
    if cat in ("internal_ip", "public_ip"):
        parts = text.split(".")
        return ".".join(parts[:2] + ["x", "x"])
    if cat == "domain_indicator":
        return re.sub(r"\.(?=[a-z]+$)", "[.]", text, flags=re.I)
    if cat == "phone":
        digits = re.sub(r"\D", "", text)
        return f"+•• ••••• •{digits[-4:]}" if len(digits) >= 4 else "••••"
    if cat == "sensitive_location":
        return "[facility location withheld]"
    return text[:2] + "•" * max(len(text) - 4, 3) + text[-2:]


def _replacement(action: str, f: dict) -> str | None:
    if action == "MASK":
        return _mask(f["category"], f["text"])
    if action == "REDACT":
        return f"[REDACTED: {f['label'].lower()}]"
    if action == "RESTRICT":
        return "[internal system]" if f["class"] == "infrastructure" else "[restricted]"
    return None


TEXT_SKIP = {"color_palette", "layout", "icon", "chart_type", "priority", "mode", "severity", "classification"}


def _walk(obj, path: str = ""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k not in TEXT_SKIP:
                yield from _walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, f"{path}[{i}]")


def _set(obj, path: str, value: str) -> None:
    tokens = re.findall(r"[^.\[\]]+|\[\d+\]", path)
    cur = obj
    for t in tokens[:-1]:
        cur = cur[int(t[1:-1])] if t.startswith("[") else cur[t]
    last = tokens[-1]
    if last.startswith("["):
        cur[int(last[1:-1])] = value
    else:
        cur[last] = value


def scan_artifact(otype: str, content: dict, audience: str, classification: str) -> dict:
    """Scan an artefact, apply the audience policy and build its released version."""
    exp = exposure(otype, audience, classification)
    findings: list[dict] = []
    released = copy.deepcopy(content)
    for path, text in list(_walk(content)):
        items = scan_text(text)
        for inj in detect_injection(text):
            items.append({"category": "injection_echo", "class": "injection", "label": "Instruction-like text",
                          "text": inj["text"], "span": inj["span"]})
        new_text = text
        for f in sorted(items, key=lambda x: -x["span"][0]):
            action = POLICY[f["class"]][exp]
            rep = _replacement(action, f)
            if rep is not None:
                a, b = f["span"]
                new_text = new_text[:a] + rep + new_text[b:]
            findings.append({**f, "id": f"F{len(findings) + 1:03d}", "path": path, "action": action,
                             "reason": REASON[action], "released_as": rep})
        if new_text != text:
            _set(released, path, new_text)
    findings.sort(key=lambda f: f["id"])
    actions = {a: sum(1 for f in findings if f["action"] == a) for a in REASON}
    return {
        "exposure": exp, "exposure_label": EXPOSURE_LABEL[exp], "findings": findings,
        "counts": summarise(findings), "actions": actions,
        "blocked": actions["BLOCK"] > 0, "review_required": actions["REVIEW"] > 0,
        "status": "blocked" if actions["BLOCK"] else ("review" if actions["REVIEW"] else "passed"),
    }, released


def sanitise_for_model(text: str, injections: list[dict]) -> tuple[str, list[str]]:
    """Text sent to the model gateway: untrusted instructions neutralised, credentials withheld."""
    notes: list[str] = []
    for inj in sorted(injections, key=lambda i: -i["span"][0]):
        a, b = inj["span"]
        text = text[:a] + "[untrusted instruction removed by Security Agent] " + text[b:]
    if injections:
        notes.append(f"{len(injections)} embedded instruction(s) removed from model context")
    creds = [f for f in scan_text(text) if f["class"] == "credential"]
    for f in sorted(creds, key=lambda x: -x["span"][0]):
        a, b = f["span"]
        text = text[:a] + "[credential withheld]" + text[b:]
    if creds:
        notes.append(f"{len(creds)} credential(s) withheld from model context")
    return text, notes
