"""Verification: claim-level traceability, drift, uncertainty preservation, cross-output consistency.

Every factual sentence in an artefact is linked to claims in the canonical evidence state:

    grounded      every date / number / entity in the sentence maps to a verified claim
    review        it maps to a claim that is itself awaiting human review (or in source conflict)
    drift         a value contradicts the claim it is about (e.g. 16 September vs claim 14 September)
    unsupported   a date or number appears that exists nowhere in the evidence or the source
    uncertainty   a hedged claim ("may be associated") is stated with more certainty than the source

The Consistency Agent then compares the value each artefact states for every claim, and the Red Team
agent aggregates the attack surface into one pass/fail verdict per artefact and per transformation.
"""
from __future__ import annotations

import re

from . import evidence as ev
from .security import TEXT_SKIP, _walk

SKIP_PATH = re.compile(r"(^|\.)(" + "|".join(sorted(TEXT_SKIP | {
    "advisory_id", "scene_number", "start_sec", "end_sec", "duration_seconds", "best_time_to_post", "subtitles",
    "chars", "music_direction", "audio_cue", "camera_direction", "hashtags", "visual_suggestion", "suggested_visual",
    "suggested_media", "visual_recommendation", "typography", "rationale", "visual_hierarchy", "status", "owner",
    "timeline", "target_platform", "contact", "unit"})) + r")(\[|\.|$)")
LEADING_ENUM = re.compile(r"^\s*(?:\d{1,2}[.)]|\d{1,2}\s?/\s?\d{1,2}|[-•→*])\s+")
NEEDS_PLACEHOLDER = re.compile(r"\[[^\]]*(?:review|confirm|tbc|to be)[^\]]*\]", re.I)


def _sentences(text: str) -> list[tuple[int, str]]:
    """Split on sentence punctuation followed by whitespace, or on newlines (IPs and decimals stay intact)."""
    out = []
    for m in re.finditer(r"[^\n]+", text):
        line, base = m.group(0), m.start()
        start = 0
        for b in re.finditer(r"[.!?]+(?=\s)", line):
            seg = line[start:b.end()]
            if seg.strip():
                out.append((base + start + len(seg) - len(seg.lstrip()), seg.strip()))
            start = b.end()
        seg = line[start:]
        if seg.strip():
            out.append((base + start + len(seg) - len(seg.lstrip()), seg.strip()))
    return [(o, s) for o, s in out if len(s) >= 2]


def _affinity(sentence_kw: set[str], claim: dict) -> int:
    ck = ev.keywords(claim["label"]) | (ev.keywords(claim["claim"]) - ev.keywords(str(claim["value"])))
    return len(sentence_kw & ck)


def _corpus_values(corpus: str, year: int | None) -> tuple[set[str], set[float]]:
    dates = ev.parse_dates(corpus, year)
    nums = ev.parse_numbers(corpus, [d["span"] for d in dates])
    return {d["iso"] for d in dates}, {n["value"] for n in nums}


def verify_artifact(content: dict, claims: list[dict], corpus: str) -> dict:
    year = ev.doc_year(corpus)
    active = [c for c in claims if c["status"] not in ("superseded", "rejected")]
    date_claims = [c for c in active if c["normalized"]["type"] == "date"]
    num_claims = [c for c in active if c["normalized"]["type"] == "number"]
    text_claims = [c for c in active if c["normalized"]["type"] == "text" and 3 <= len(c["value"]) <= 60]
    corpus_dates, corpus_nums = _corpus_values(corpus, year)
    refs: list[dict] = []
    fields = list(_walk(content))
    # sibling strings in the same object (e.g. a metric's label) give short cells their meaning
    siblings: dict[str, str] = {}
    for path, text in fields:
        parent = path.rsplit(".", 1)[0] if "." in path else ""
        siblings[parent] = siblings.get(parent, "") + " " + text
    for path, text in fields:
        if SKIP_PATH.search(path) or not text.strip():
            continue
        parent = path.rsplit(".", 1)[0] if "." in path else ""
        for offset, sent in _sentences(text):
            body = LEADING_ENUM.sub("", sent)
            skw = ev.keywords(body)
            if len(body.split()) < 6 and parent:
                skw |= ev.keywords(siblings.get(parent, ""))
            dates = ev.parse_dates(body, year)
            skip = [d["span"] for d in dates] + [list(m.span()) for m in ev.TIME_RX.finditer(body)]
            nums = [n for n in ev.parse_numbers(body, skip) if not (n["value"] >= 1900 and n["value"] <= 2100 and not n["unit"])]
            linked: dict[str, dict] = {}
            issues: list[dict] = []
            observed: dict[str, str] = {}

            sentence_isos = {d["iso"] for d in dates}
            for d in dates:
                exact = [c for c in date_claims if c["normalized"]["value"] == d["iso"]]
                best = max(date_claims, key=lambda c: _affinity(skw, c), default=None)
                best_aff = _affinity(skw, best) if best else 0
                if exact:
                    target = max(exact, key=lambda c: _affinity(skw, c))
                    if best and best is not target and best["normalized"]["value"] not in sentence_isos \
                            and best_aff >= 2 and best_aff > _affinity(skw, target) + 1:
                        issues.append({"kind": "drift", "claim_id": best["claim_id"], "expected": best["display_value"],
                                       "found": d["surface"], "detail": f"States {d['surface']} for '{best['label']}'; evidence says {best['display_value']}."})
                        linked[best["claim_id"]] = best
                        observed[best["claim_id"]] = d["iso"]
                    else:
                        linked[target["claim_id"]] = target
                        observed[target["claim_id"]] = d["iso"]
                elif best and best_aff >= 1:
                    issues.append({"kind": "drift", "claim_id": best["claim_id"], "expected": best["display_value"],
                                   "found": d["surface"], "detail": f"States {d['surface']} for '{best['label']}'; evidence says {best['display_value']}."})
                    linked[best["claim_id"]] = best
                    observed[best["claim_id"]] = d["iso"]
                elif d["iso"] not in corpus_dates:
                    issues.append({"kind": "unsupported", "found": d["surface"], "detail": f"Date {d['surface']} does not appear in the evidence or the source."})

            for n in nums:
                if n["value"] < 10 and not n["unit"] and not re.fullmatch(r"[A-Za-z]+", n["surface"]) and len(nums) > 2:
                    continue  # list numbering / small ordinals inside dense sentences
                exact = [c for c in num_claims if c["normalized"]["value"] == n["value"]]
                if exact:
                    target = max(exact, key=lambda c: _affinity(skw, c))
                    linked[target["claim_id"]] = target
                    observed[target["claim_id"]] = str(n["value"])
                    continue
                if n["value"] in corpus_nums:
                    continue
                if re.fullmatch(r"[A-Za-z]+", n["surface"]):
                    continue  # number words ("one of the") that are not in the evidence are not claims
                best = max(num_claims, key=lambda c: _affinity(skw, c), default=None)
                if best and _affinity(skw, best) >= 2:
                    issues.append({"kind": "drift", "claim_id": best["claim_id"], "expected": best["display_value"],
                                   "found": n["surface"], "detail": f"States {n['surface']} for '{best['label']}'; evidence says {best['display_value']}."})
                    linked[best["claim_id"]] = best
                    observed[best["claim_id"]] = str(n["value"])
                else:
                    issues.append({"kind": "unsupported", "found": n["surface"], "detail": f"Figure {n['surface']} does not appear in the evidence or the source."})

            low = body.lower()
            for c in text_claims:
                if c["value"].lower() in low:
                    linked[c["claim_id"]] = c

            # uncertainty preservation: hedged claims must stay hedged
            gen_mod = ev.modality(body)
            for c in (linked.values() if len(body.split()) >= 4 else []):  # skip table cells / bare values
                if ev.MODALITY_RANK.get(c["modality"], 5) < 5 and ev.MODALITY_RANK[gen_mod] > ev.MODALITY_RANK[c["modality"]]:
                    issues.append({"kind": "uncertainty", "claim_id": c["claim_id"], "expected": c["modality"], "found": gen_mod,
                                   "detail": f"Source certainty is '{c['modality']}' but the output states it as '{gen_mod}'."})

            placeholder = bool(NEEDS_PLACEHOLDER.search(body))
            if not linked and not issues and not placeholder:
                continue
            kinds = {i["kind"] for i in issues}
            if "drift" in kinds:
                status = "drift"
            elif "unsupported" in kinds:
                status = "unsupported"
            elif "uncertainty" in kinds:
                status = "uncertainty"
            elif placeholder or any(c["status"] in ("needs_review", "conflict", "unsupported") for c in linked.values()):
                status = "review"
            else:
                status = "grounded"
            refs.append({
                "ref_id": f"R{len(refs) + 1:03d}", "path": path, "offset": offset, "sentence": sent,
                "claim_ids": sorted(linked), "observed": observed, "status": status, "issues": issues,
                "modality": gen_mod,
            })
    counts = {k: sum(1 for r in refs if r["status"] == k) for k in ("grounded", "review", "drift", "unsupported", "uncertainty")}
    failed = counts["drift"] + counts["unsupported"] + counts["uncertainty"]
    return {
        "refs": refs, "counts": counts,
        "claims_used": sorted({cid for r in refs for cid in r["claim_ids"]}),
        "status": "failed" if failed else ("needs_review" if counts["review"] else "passed"),
    }


def consistency(artifacts: dict[str, dict], claims: list[dict]) -> list[dict]:
    """Cross-output check: every artefact must state the same value for the same claim."""
    by_id = {c["claim_id"]: c for c in claims}
    conflicts = []
    for cid, claim in by_id.items():
        obs: list[dict] = []
        dependents = []
        for otype, art in artifacts.items():
            ver = art.get("verification") or {}
            for r in ver.get("refs", []):
                if cid in r["claim_ids"]:
                    if otype not in dependents:
                        dependents.append(otype)
                    if cid in r["observed"]:
                        found = next((i["found"] for i in r["issues"] if i.get("claim_id") == cid and i["kind"] == "drift"), None)
                        obs.append({"artifact": otype, "value": found or claim["display_value"], "path": r["path"],
                                    "sentence": r["sentence"], "matches": found is None})
        wrong = [o for o in obs if not o["matches"]]
        if not wrong:
            continue
        conflicts.append({
            "id": f"CX-{cid}", "claim_id": cid, "attribute": claim["label"], "source_value": claim["display_value"],
            "observations": obs, "affected": sorted({o["artifact"] for o in wrong}), "dependents": dependents,
            "status": "open",
        })
    return conflicts


def red_team(artifact: dict, conflicts: list[dict], otype: str) -> dict:
    ver = artifact.get("verification") or {"refs": []}
    sec = artifact.get("security") or {"actions": {}}
    issues = [i for r in ver["refs"] for i in r["issues"]]
    result = {
        "factual_drift": sum(1 for i in issues if i["kind"] == "drift"),
        "unsupported_claims": sum(1 for i in issues if i["kind"] == "unsupported"),
        "cross_output_conflicts": sum(1 for c in conflicts if otype in c["affected"]),
        "security_leaks": sec.get("actions", {}).get("BLOCK", 0),
        "uncertainty_violations": sum(1 for i in issues if i["kind"] == "uncertainty"),
    }
    result["status"] = "passed" if not any(result.values()) else "failed"
    return result
