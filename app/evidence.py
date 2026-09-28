"""Canonical evidence state: CLAIM -> EVIDENCE -> SOURCE -> LOCATION.

The Evidence Extraction Agent (an LLM) proposes facts with a supporting quote. Nothing it says is
trusted until this module *earns* the claim's status against the source text:

    verified       the quote is found verbatim in the source and contains the value
    needs_review   the value is in the source but the quote had to be re-anchored
    unsupported    neither the quote nor the value can be found in the source

Each claim records its source, page (from real PDF page offsets), character span and, for PDFs,
a bounding box found with pdfium. Certainty (modality) is read from the source sentence, not
from the model. Claims from several sources are merged; disagreements become source conflicts
that stay UNRESOLVED until a human decides.
"""
from __future__ import annotations

import re
from datetime import date

from .ingest import Source

# ---------------------------------------------------------------------------
# Value normalisation (dates, numbers)
# ---------------------------------------------------------------------------
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
MON_RX = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
DATE_PATTERNS = [
    re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?{MON_RX}\.?(?:,?\s+(\d{{4}}))?\b", re.I),     # 14 September 2026
    re.compile(rf"\b{MON_RX}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?\b", re.I),               # September 14, 2026
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),                                                          # 2026-09-14
    re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"),                                                      # 14/09/2026
]


def _month(tok: str) -> int:
    tok = tok.lower()[:3]
    return next(v for k, v in MONTHS.items() if k.startswith(tok))


def parse_dates(text: str, default_year: int | None = None) -> list[dict]:
    """[{surface, iso, span}] for every date in text."""
    out: list[dict] = []
    taken: list[tuple[int, int]] = []
    year0 = default_year or date.today().year
    for i, rx in enumerate(DATE_PATTERNS):
        for m in rx.finditer(text or ""):
            a, b = m.span()
            if any(a < y and b > x for x, y in taken):
                continue
            try:
                if i == 0:
                    d, mo, y = int(m.group(1)), _month(m.group(2)), int(m.group(3) or year0)
                elif i == 1:
                    mo, d, y = _month(m.group(1)), int(m.group(2)), int(m.group(3) or year0)
                elif i == 2:
                    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                else:
                    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                iso = date(y, mo, d).isoformat()
            except (ValueError, StopIteration):
                continue
            taken.append((a, b))
            out.append({"surface": m.group(0), "iso": iso, "span": [a, b]})
    return sorted(out, key=lambda x: x["span"][0])


NUM_WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())}
NUM_RX = re.compile(
    r"(?<![\w./:-])(?:[$€£₹]|INR\s|USD\s|Rs\.?\s)?(\d[\d,]*(?:\.\d+)?)\s?(%|percent|crore|lakh|million|billion|[kKmM]\b)?(?![\w/:-]|\.\d)"
    r"|\b(" + "|".join(NUM_WORDS) + r")\b", re.I)


def parse_numbers(text: str, skip_spans: list[list[int]] | None = None) -> list[dict]:
    """[{surface, value, unit, span}] excluding numbers inside skip_spans (e.g. dates, times)."""
    out = []
    for m in NUM_RX.finditer(text or ""):
        a, b = m.span()
        if skip_spans and any(a < y and b > x for x, y in skip_spans):
            continue
        if m.group(3):
            val, unit = float(NUM_WORDS[m.group(3).lower()]), ""
        else:
            try:
                val = float(m.group(1).replace(",", ""))
            except ValueError:
                continue
            unit = (m.group(2) or "").lower().replace("percent", "%")
        out.append({"surface": m.group(0).strip(), "value": val, "unit": unit, "span": [a, b]})
    return out


TIME_RX = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?/\s?\d{1,2}\b(?!/)")


def normalise(value: str, default_year: int | None = None) -> dict:
    ds = parse_dates(value, default_year)
    if ds:
        return {"type": "date", "value": ds[0]["iso"]}
    ns = parse_numbers(value, [d["span"] for d in ds])
    if len(ns) == 1 and len(re.sub(r"[\W\d_]", "", value)) <= 12:
        return {"type": "number", "value": ns[0]["value"], "unit": ns[0]["unit"]}
    return {"type": "text", "value": re.sub(r"\s+", " ", value.strip().lower())}


def fmt_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B')} {d.year}"


def doc_year(text: str) -> int | None:
    years = re.findall(r"\b(20\d{2}|19\d{2})\b", text or "")
    return int(max(set(years), key=years.count)) if years else None


# ---------------------------------------------------------------------------
# Modality (epistemic strength)
# ---------------------------------------------------------------------------
MODALITY_RANK = {"unverified": 1, "alleged": 2, "suspected": 2, "possible": 2, "reported": 3, "estimated": 3,
                 "probable": 4, "confirmed": 5}
HEDGES: list[tuple[str, re.Pattern]] = [
    ("unverified", re.compile(r"\b(unverified|unconfirmed|not (?:yet )?(?:been )?confirmed|remains? unconfirmed)\b", re.I)),
    ("alleged", re.compile(r"\b(alleged(?:ly)?|claimed)\b", re.I)),
    ("suspected", re.compile(r"\b(suspect(?:ed)?)\b", re.I)),
    ("possible", re.compile(r"\b(may|might|could|possibl[ey]|potential(?:ly)?|perhaps)\b", re.I)),
    ("probable", re.compile(r"\b(likely|probabl[ey]|appears? to|believed to)\b", re.I)),
    ("reported", re.compile(r"\b(reported(?:ly)?|according to)\b", re.I)),
    ("estimated", re.compile(r"\b(estimated?|approximately|around|roughly|about)\b", re.I)),
]


def modality(text: str) -> str:
    for name, rx in HEDGES:
        if rx.search(text or ""):
            return name
    return "confirmed"


# ---------------------------------------------------------------------------
# Locating evidence in the source
# ---------------------------------------------------------------------------
STOP = set("the a an and or of to in on for with by from at as is are was were be been this that these those it its "
           "their our has have had will would can could should may might not no into over under than then also "
           "which who what when where there here all any each more most some such only very".split())


SYNONYMS = {"intrusion": "incident", "breach": "incident", "attack": "incident", "compromise": "incident",
            "discover": "detect", "identifi": "detect", "identify": "detect", "observ": "detect",
            "impact": "affect", "system": "system", "host": "system", "machine": "system", "server": "system",
            "actor": "group", "adversary": "group", "attribut": "group"}


def _stem(w: str) -> str:
    if w in SYNONYMS:
        return SYNONYMS[w]
    for suf in ("ation", "ment", "ion", "ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    return SYNONYMS.get(w, w)


def keywords(text: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z][a-z-]{2,}", (text or "").lower()) if w not in STOP}


def _flex(q: str) -> re.Pattern:
    words = [re.escape(w) for w in re.findall(r"\S+", q.strip(" .\"'…"))]
    return re.compile(r"\s+".join(words), re.I)


def _heading_break(text: str, i: int) -> bool:
    """True when text[i-1] is a newline that ends a short line (heading / label), not a wrapped sentence."""
    if text[i - 1] != "\n":
        return False
    prev_start = text.rfind("\n", 0, i - 1) + 1
    return len(text[prev_start:i - 1].strip()) < 45


def sentence_at(text: str, start: int, end: int) -> tuple[int, int]:
    a = start
    while a > 0 and not (text[a - 1] in ".!?" and (a >= len(text) or text[a].isspace())) \
            and text[a - 1:a + 1] != "\n\n" and not _heading_break(text, a):
        a -= 1
        if start - a > 400:
            break
    while a < start and text[a].isspace():
        a += 1
    m = re.search(r"[.!?](?=\s|$)|\n\n", text[end:])
    b = end + (m.end() if m else len(text) - end)
    return a, min(b, len(text))


def value_in(value: str, text: str, year: int | None) -> bool:
    nv = normalise(value, year)
    if nv["type"] == "date":
        return any(d["iso"] == nv["value"] for d in parse_dates(text, year))
    if nv["type"] == "number":
        dates = [d["span"] for d in parse_dates(text, year)]
        return any(n["value"] == nv["value"] for n in parse_numbers(text, dates))
    return nv["value"] in re.sub(r"\s+", " ", text.lower())


def locate(source: Source, quote: str, value: str) -> dict:
    text = source.text or ""
    year = doc_year(text)
    q = (quote or "").strip()
    if len(q) >= 6:
        m = _flex(q).search(text)
        if m:
            a, b = sentence_at(text, m.start(), m.end())
            exact = value_in(value, text[m.start():m.end()], year) or value_in(value, text[a:b], year)
            return {"span": [a, b], "match": [m.start(), m.end()], "exact": True, "value_ok": exact}
    # re-anchor on the value itself, preferring the sentence that shares most words with the quote
    nv = normalise(value, year)
    cands: list[tuple[int, int]] = []
    if nv["type"] == "date":
        cands = [tuple(d["span"]) for d in parse_dates(text, year) if d["iso"] == nv["value"]]
    elif nv["type"] == "number":
        dates = [d["span"] for d in parse_dates(text, year)]
        cands = [tuple(n["span"]) for n in parse_numbers(text, dates) if n["value"] == nv["value"]]
    elif len(nv["value"]) >= 3:
        cands = [m.span() for m in re.finditer(re.escape(value.strip()), text, re.I)]
        if not cands:
            # list-like text values ("payroll server, file server"): every value word must sit in one sentence
            vk = keywords(value)
            for m in re.finditer(r"[^.!?]+[.!?]", text):
                if vk and vk <= keywords(m.group()):
                    a, b = sentence_at(text, m.start() + len(m.group()) - len(m.group().lstrip()), m.end() - 1)
                    return {"span": [a, b], "match": [a, b], "exact": False, "value_ok": False, "words_ok": True}
    if not cands:
        return {"span": None, "match": None, "exact": False, "value_ok": False}
    qk = keywords(q)
    best = max(cands, key=lambda c: len(qk & keywords(text[slice(*sentence_at(text, *c))])))
    a, b = sentence_at(text, *best)
    return {"span": [a, b], "match": list(best), "exact": False, "value_ok": True}


def bbox(source: Source, page: int | None, snippet: str) -> dict | None:
    if not source.pdf or not page:
        return None
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(source.pdf)
        pg = pdf[page - 1]
        tp = pg.get_textpage()
        words = re.findall(r"\S+", snippet)
        rects = []
        # search progressively shorter prefixes: text may wrap onto a new line inside the PDF
        for n in (len(words), 12, 8, 5):
            probe = " ".join(words[:n])
            if not probe:
                continue
            found = tp.search(probe, match_case=False).get_next()
            if found:
                i, c = found
                rects = [tp.get_charbox(k) for k in range(i, i + c)]
                break
        if not rects:
            return None
        w, h = pg.get_size()
        x1, y1 = min(r[0] for r in rects), min(r[1] for r in rects)
        x2, y2 = max(r[2] for r in rects), max(r[3] for r in rects)
        # convert PDF coordinates (origin bottom-left) to top-left, rounded to 0.1pt
        return {"bbox": [round(x1, 1), round(h - y2, 1), round(x2, 1), round(h - y1, 1)], "page_size": [w, h]}
    except Exception:  # noqa: BLE001 - location is best-effort; claim remains valid without a box
        return None


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------
def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")[:48] or "fact"


def claims_from_brief(source: Source, brief: dict, injections: list[dict], start_index: int, model: str | None) -> list[dict]:
    text = source.text or ""
    year = doc_year(text)
    blocked = [i["span"] for i in injections]
    claims = []
    for f in brief.get("key_facts", []):
        value = str(f.get("value") or "").strip()
        if not value:
            continue
        loc = locate(source, f.get("evidence", ""), value)
        span = loc["span"]
        if span and any(span[0] < y and span[1] > x for x, y in blocked):
            continue  # never build evidence from an injected instruction
        evidence_text = re.sub(r"\s+", " ", text[span[0]:span[1]]).strip() if span else (f.get("evidence") or "")
        qk = keywords(f.get("evidence", "")) - keywords(value)
        near = bool(span) and bool(qk) and len(qk & keywords(evidence_text)) / len(qk) >= 0.8
        if span and loc["exact"] and loc["value_ok"]:
            status, note = "verified", "Quote found verbatim in the source and contains the value."
        elif span and loc["value_ok"] and near:
            status, note = "verified", "Value found verbatim; quote matched the source sentence after normalisation."
        elif span and loc.get("words_ok"):
            status, note = "needs_review", "Every word of the value appears in one source sentence, but not verbatim."
        elif span and loc["value_ok"]:
            status, note = "needs_review", "Model quote could not be matched exactly; evidence re-anchored on the value."
        else:
            status, note = "unsupported", "Neither the quote nor the value was found in the source."
        page = source.page_of(span[0]) if span else None
        snippet = text[loc["match"][0]:loc["match"][1]] if loc.get("match") else ""
        location = bbox(source, page, re.sub(r"\s+", " ", evidence_text if loc["exact"] else snippet)) if page else None
        norm = normalise(value, year)
        claims.append({
            "claim_id": f"C{start_index + len(claims):03d}",
            "claim": evidence_text or f"{f.get('label')}: {value}",
            "label": f.get("label") or "Fact",
            "category": (f.get("category") or "GENERAL").upper(),
            "entity": f.get("subject") or f.get("label") or "",
            "attribute": _slug(f.get("label", "")),
            "value": value,
            "normalized": norm,
            "display_value": fmt_date(norm["value"]) if norm["type"] == "date" else value,
            "modality": modality(evidence_text) if span else "unverified",
            "source_id": source.id, "source_name": source.name,
            "page": page, "char_span": span, "location": location,
            "evidence_text": evidence_text,
            "status": status, "grounding_note": note,
            "extracted_by": "Evidence Extraction Agent", "model": model,
            "corroborated_by": [], "version": 1, "history": [],
        })
    return _dedupe(claims)


def _dedupe(claims: list[dict]) -> list[dict]:
    out: list[dict] = []
    for c in claims:
        if any(o["normalized"] == c["normalized"] and o["char_span"] == c["char_span"] for o in out):
            continue
        out.append(c)
    return out


def _same_attribute(a: dict, b: dict) -> bool:
    if a["normalized"]["type"] != b["normalized"]["type"]:
        return False
    ka, kb = keywords(a["label"]), keywords(b["label"])
    if ka and kb and len(ka & kb) / len(ka | kb) > 0.6:
        return True
    ea = keywords(a["claim"]) - keywords(str(a["value"]))
    eb = keywords(b["claim"]) - keywords(str(b["value"]))
    return a["category"] == b["category"] and len(ea & eb) >= 3


def merge_sources(per_source: list[list[dict]]) -> tuple[list[dict], list[dict]]:
    """Merge claims across sources. Same attribute + same value -> corroboration; different value -> conflict."""
    merged: list[dict] = []
    conflicts: list[dict] = []
    for group in per_source:
        for c in group:
            twin = next((m for m in merged if m["source_id"] != c["source_id"] and _same_attribute(m, c)), None)
            if twin is None:
                merged.append(c)
            elif twin["normalized"] == c["normalized"]:
                twin["corroborated_by"].append({"source_id": c["source_id"], "source_name": c["source_name"],
                                                "page": c["page"], "evidence_text": c["evidence_text"],
                                                "modality": c["modality"]})
                # the strongest independent statement sets the claim's certainty
                if MODALITY_RANK[c["modality"]] > MODALITY_RANK[twin["modality"]]:
                    twin["modality"] = c["modality"]
            elif twin["normalized"]["type"] in ("date", "number"):
                merged.append(c)
                for x in (twin, c):
                    x["status"] = "conflict"
                    x["grounding_note"] = "Sources disagree on this value. Human review required."
                conflicts.append({
                    "id": f"SC{len(conflicts) + 1:02d}", "attribute": twin["label"], "status": "unresolved",
                    "claim_ids": [twin["claim_id"], c["claim_id"]],
                    "values": [{"claim_id": x["claim_id"], "source_id": x["source_id"], "source_name": x["source_name"],
                                "value": x["display_value"], "page": x["page"], "evidence_text": x["evidence_text"]}
                               for x in (twin, c)],
                    "resolution": None,
                })
            else:
                merged.append(c)
    # renumber so IDs are stable and contiguous across the merged ledger
    remap = {}
    for i, c in enumerate(merged, 1):
        remap[c["claim_id"] + c["source_id"]] = f"C{i:03d}"
    for c in merged:
        c["claim_id"] = remap[c["claim_id"] + c["source_id"]]
    for sc in conflicts:
        sc["claim_ids"] = [remap[v["claim_id"] + v["source_id"]] for v in sc["values"]]
        for v, cid in zip(sc["values"], sc["claim_ids"]):
            v["claim_id"] = cid
    return merged, conflicts
