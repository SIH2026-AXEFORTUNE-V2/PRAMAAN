"""Orchestrator: plans, runs and supervises a transformation.

    PLAN -> ACT -> OBSERVE -> CRITIQUE -> REPAIR -> VERIFY -> DECIDE

One transformation = one centralised state object. Every screen (agent workspace, task panel,
artefact cards, evidence ledger, audit) renders from this object, so statuses never disagree.

Task graph
    contract ─▶ source understanding (per source, parallel) ─▶ source security screen
             ─▶ evidence extraction (per source, parallel) ─▶ plan
             ─▶ specialist agents (parallel, each verified + security-scanned as it lands)
             ─▶ consistency ─▶ red team ─▶ provenance ─▶ human review

Agents exchange structured objects only (claims, findings, artefact JSON, verification results).
"""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import re
import shutil
import time

from . import config, evidence as ev, imagegen, ledger, perception, prompts, quality, security, settings, verify, videogen
from .catalog import BRIEF_SCHEMA, OUTPUT_TYPES, audience_text
from .groq_engine import GroqEngine
from .hf_engine import EngineError, HFEngine
from .ingest import Source
from .scripted_engine import ScriptedEngine

log = logging.getLogger("pramaan.orchestrator")

TEMPERATURE = {"Formal": 0.35, "Neutral": 0.3, "Technical": 0.3, "Executive": 0.4, "Advisory": 0.35}
SCRIPTED = ScriptedEngine()
LIVE = None if config.DEMO_MODE else (GroqEngine() if config.LLM_PROVIDER == "groq" else HFEngine())

T: dict[str, dict] = {}                 # transformation id -> state
SOURCES: dict[str, list[Source]] = {}   # transformation id -> parsed sources (text, pages, pdf bytes)
MODEL_TEXT: dict[str, dict[str, str]] = {}   # sanitised text actually sent to models, per source
_sem = asyncio.Semaphore(config.MAX_PARALLEL_AGENTS)
_tasks: set[asyncio.Task] = set()

PLAN_STEPS = [
    ("understand", "Understand request", "Parse intent and sign the transformation contract"),
    ("context", "Identify context", "Parse sources and resolve their structure"),
    ("evidence", "Extract evidence", "Build the canonical claim ledger"),
    ("plan", "Plan transformations", "Select agents and the dependency graph"),
    ("generate", "Execute specialist agents", "Generate artefacts in parallel"),
    ("verify", "Verify outputs", "Consistency, grounding and red-team checks"),
    ("security", "Apply security checks", "Screen sources and outputs, apply audience policy"),
    ("approval", "Prepare for approval", "Record provenance and route to human review"),
]

OUTPUT_KEYWORDS = [
    ("executive_summary", r"exec(?:utive)?\s*(?:summary|brief)|\bsummary\b|\bbluf\b"),
    ("advisory", r"advisor(?:y|ies)"),
    ("linkedin", r"linked\s?in"),
    ("twitter", r"\btwitter\b|\btweets?\b|\bx\s*(?:/\s*social\s*)?(?:thread|post)\b|social thread"),
    ("infographic", r"info\s?graphic"),
    ("presentation", r"presentation|\bdeck\b|\bslides?\b|\bppt"),
    ("video", r"\bvideo\b|storyboard|\bscript\b"),
]
REVISION_RX = re.compile(r"\b(make|shorten|shorter|longer|expand|add|remove|change|rewrite|simplify|more|less|update|fix|"
                         r"tone|emphasi[sz]e|focus|reduce|increase|rephrase|revise|improve)\b", re.I)


def parse_outputs(text: str) -> list[str]:
    return [k for k, rx in OUTPUT_KEYWORDS if re.search(rx, text or "", re.I)]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _dir(tid: str):
    return config.JOBS_DIR / tid


def save(t: dict) -> None:
    t["updated_at"] = ledger.now()
    d = _dir(t["id"])
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "state.json.tmp"
    tmp.write_text(json.dumps(t, ensure_ascii=False), encoding="utf-8")
    tmp.replace(d / "state.json")


def _save_source(tid: str, s: Source) -> None:
    d = _dir(tid) / "sources"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{s.id}.txt").write_text(s.text or "", encoding="utf-8")
    (d / f"{s.id}.meta.json").write_text(json.dumps({"pages": s.pages, **s.describe()}), encoding="utf-8")
    if s.pdf:
        (d / f"{s.id}.pdf").write_bytes(s.pdf)


def load_all() -> None:
    for state in sorted(config.JOBS_DIR.glob("TR-*/state.json")):
        try:
            t = json.loads(state.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        interrupted = False
        for task in t["tasks"]:
            if task["status"] in ("running", "queued") and task["key"] != "approval":
                task.update(status="failed", error="Interrupted by a server restart.", detail="Interrupted")
                interrupted = True
        for art in t["artifacts"].values():
            if art["status"] in ("queued", "generating"):
                art["status"] = "failed"
                art["error"] = "Interrupted by a server restart."
        if interrupted and t["status"] == "running":
            t["status"] = "failed"
            t["error"] = "Processing was interrupted by a server restart."
        T[t["id"]] = t
        srcs = []
        for meta_path in sorted((state.parent / "sources").glob("*.meta.json")):
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            sid = meta["id"]
            pdf = state.parent / "sources" / f"{sid}.pdf"
            srcs.append(Source(kind=meta["kind"], name=meta["name"], mime=meta["mime"], url=meta.get("url", ""),
                               text=(state.parent / "sources" / f"{sid}.txt").read_text(encoding="utf-8"),
                               id=sid, size_bytes=meta.get("size_bytes", 0), sha256=meta.get("sha256", ""),
                               pages=meta.get("pages", []), pdf=pdf.read_bytes() if pdf.exists() else None))
        SOURCES[t["id"]] = srcs
        MODEL_TEXT[t["id"]] = {s.id: security.sanitise_for_model(s.text, security.detect_injection(s.text))[0] for s in srcs}


def next_id() -> str:
    nums = [int(k.split("-")[1]) for k in T if re.fullmatch(r"TR-\d+", k)]
    return f"TR-{(max(nums) if nums else 0) + 1:05d}"


def delete(tid: str) -> None:
    T.pop(tid, None)
    SOURCES.pop(tid, None)
    MODEL_TEXT.pop(tid, None)
    shutil.rmtree(_dir(tid), ignore_errors=True)


def spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------
def _task(t: dict, key: str, agent: str, title: str, stage: str, description: str, capability: str,
          depends: list[str] | None = None, artifact: str | None = None) -> dict:
    task = {"id": f"T{len(t['tasks']) + 1:02d}", "key": key, "agent": agent, "title": title, "stage": stage,
            "description": description, "status": "queued", "progress": 0, "detail": "Queued", "started": None,
            "ended": None, "seconds": None, "capability": capability, "model": None, "tokens": 0, "error": None,
            "depends_on": depends or [], "artifact": artifact, "_t0": None}
    t["tasks"].append(task)
    return task


def task(t: dict, key: str) -> dict | None:
    """Latest task with this key (regenerations append new tasks)."""
    return next((x for x in reversed(t["tasks"]) if x["key"] == key), None)


def _start(tk: dict, detail: str = "Running") -> None:
    tk.update(status="running", started=ledger.now(), detail=detail, progress=max(tk["progress"], 5), error=None)
    tk["_t0"] = time.perf_counter()


def _finish(tk: dict, status: str = "completed", detail: str = "Completed", **kw) -> None:
    secs = round(time.perf_counter() - tk["_t0"], 1) if tk.get("_t0") else 0.0
    tk.update(status=status, ended=ledger.now(), seconds=secs, detail=detail,
              progress=100 if status in ("completed", "needs_review") else tk["progress"], **kw)


def plan(t: dict) -> list[dict]:
    steps = []
    for i, (stage, title, detail) in enumerate(PLAN_STEPS, 1):
        tasks = [x for x in t["tasks"] if x["stage"] == stage]
        st = [x["status"] for x in tasks]
        if not st:
            status = "queued"
        elif "failed" in st and all(s in ("failed", "completed") for s in st):
            status = "failed"
        elif "running" in st:
            status = "running"
        elif "blocked" in st:
            status = "blocked"
        elif all(s == "completed" for s in st):
            status = "completed"
        elif "needs_review" in st and all(s in ("completed", "needs_review") for s in st):
            status = "needs_review"
        elif any(s == "completed" for s in st):
            status = "running"
        else:
            status = "queued"
        steps.append({"step": i, "stage": stage, "title": title, "detail": detail, "status": status,
                      "tasks": [x["id"] for x in tasks]})
    return steps


def _new_artifact(otype: str) -> dict:
    meta = OUTPUT_TYPES[otype]
    return {"type": otype, "label": meta["label"], "agent": meta["agent"], "description": meta["description"],
            "exports": meta["exports"], "status": "queued", "version": 0, "content": None, "released": None,
            "verification": None, "security": None, "red_team": None, "format_warnings": [],
            "approval": {"status": "pending", "by": None, "at": None, "comment": "", "history": []},
            "output_hash": None, "versions": [], "stale": None, "error": None, "exported": [], "illustrations": []}


def serialize(t: dict, full: bool = True) -> dict:
    out = {k: v for k, v in t.items() if k != "tasks"}
    out["tasks"] = [{k: v for k, v in x.items() if not k.startswith("_")} for x in t["tasks"]]
    out["plan"] = plan(t)
    if full:
        out["artifacts"] = {k: {**a, "versions": [{kk: vv for kk, vv in v.items() if kk != "content"} for v in a["versions"]]}
                            for k, a in t["artifacts"].items()}
    return out


def summary(t: dict) -> dict:
    arts = t["artifacts"].values()
    return {"id": t["id"], "title": t["title"], "created_at": t["created_at"], "updated_at": t["updated_at"],
            "status": t["status"], "outputs": list(t["artifacts"]), "source_names": [s["name"] for s in t["sources"]],
            "approved": sum(1 for a in arts if a["approval"]["status"] == "approved"), "total": len(t["artifacts"]),
            "red_team": (t.get("red_team") or {}).get("status")}


def _corpus(t: dict) -> str:
    texts = [s.text for s in SOURCES.get(t["id"], [])]
    return "\n".join(texts)


def _contract(t: dict) -> dict:
    p = t["params"]
    return {
        "transformation_id": t["id"], "version": t["contract"]["version"] + 1 if t.get("contract") else 1,
        "sources": [{"id": s["id"], "name": s["name"], "sha256": s["sha256"]} for s in t["sources"]],
        "audience": audience_text(p), "tone": p["tone"], "language": p["language"], "detail_level": p["detail"],
        "objective": p["objective"], "style": p["style"], "security_classification": p["classification"],
        "requested_outputs": [OUTPUT_TYPES[o]["label"] for o in t["artifacts"]],
        "instructions": p.get("instructions", ""),
        "truth_constraints": {"preserve_dates": True, "preserve_numbers": True, "preserve_entities": True,
                              "preserve_uncertainty": True, "evidence_locked": True, "no_silent_conflict_resolution": True},
        "security_constraints": {"scan_sensitive_data": True, "apply_audience_policy": True,
                                 "treat_source_as_untrusted": True,
                                 "neutralise_injection": settings.get()["neutralise_injection"],
                                 "withhold_credentials_from_model": settings.get()["withhold_credentials"],
                                 "human_approval_required": True},
        "signed_at": ledger.now(),
    }


def _engine_info() -> dict:
    if LIVE:
        return {"route": "live", "mode": LIVE.mode, "model": LIVE.model, "fallback": None}
    return {"route": "offline", "mode": "offline", "model": SCRIPTED.model, "fallback": None}


# ---------------------------------------------------------------------------
# Create + run
# ---------------------------------------------------------------------------
def create(sources: list[Source], outputs: list[str], params: dict, request: str) -> dict:
    tid = next_id()
    for i, s in enumerate(sources, 1):
        s.id = f"S{i}"
    op = settings.operator()
    t: dict = {
        "id": tid, "created_at": ledger.now(), "updated_at": ledger.now(), "status": "running", "error": None,
        "title": sources[0].name, "request": request, "params": params, "contract": None,
        "engine": _engine_info(), "sources": [s.describe() for s in sources],
        "messages": [{"role": "user", "author": op, "text": request, "ts": ledger.now(), "sources": [s.id for s in sources]}],
        "tasks": [], "briefs": {}, "summary": "", "claims": [], "source_conflicts": [],
        "artifacts": {o: _new_artifact(o) for o in outputs},
        "consistency": {"status": "pending", "conflicts": [], "checked_at": None},
        "red_team": {"status": "pending"},
        "security": {"status": "pending", "source_findings": [], "summary": {}, "injections": [], "model_context_notes": []},
        "provenance": {"transformation_id": tid, "source_hashes": {s.id: s.sha256 for s in sources},
                       "contract_hash": None, "evidence_hash": None, "ledger_entries": []},
        "total_seconds": None,
    }
    t["contract"] = _contract(t)
    t["provenance"]["contract_hash"] = ledger.canonical_hash({k: v for k, v in t["contract"].items() if k != "signed_at"})

    ct = _task(t, "contract", "Orchestrator", "Understand request", "understand",
               "Interpret the request and sign the transformation contract", "planning")
    ct.update(status="completed", progress=100, started=ledger.now(), ended=ledger.now(), seconds=0.0,
              detail=f"Contract v1 · {len(outputs)} outputs", model="rule-based")
    src_ids = []
    for s in sources:
        media = s.media is not None
        cap = "multimodal_understanding" if s.kind in ("image", "video") or (media and s.mime == "application/pdf") \
            else "speech_to_text" if s.kind == "audio" else "document_parsing"
        x = _task(t, f"source:{s.id}", "Source Understanding Agent", f"Understand {s.name}", "context",
                  "Parse the source, recover structure and page map", cap, ["T01"])
        src_ids.append(x["id"])
    sec = _task(t, "source_security", "Security Agent", "Screen sources", "security",
                "Detect sensitive data and embedded instructions before any model call", "policy_engine", src_ids)
    evt = _task(t, "evidence", "Evidence Extraction Agent", "Extract evidence", "evidence",
                "Build the canonical claim ledger and verify every quote", "text_reasoning", [sec["id"]])
    pl = _task(t, "plan", "Orchestrator", "Plan transformations", "plan",
               "Select specialist agents and build the dependency graph", "planning", [evt["id"]])
    writers = []
    for o in outputs:
        w = _task(t, f"write:{o}", OUTPUT_TYPES[o]["agent"], f"Generate {OUTPUT_TYPES[o]['label']}", "generate",
                  OUTPUT_TYPES[o]["description"], "text_reasoning", [pl["id"]], artifact=o)
        writers.append(w["id"])
    _add_verification_tasks(t, writers)
    T[tid] = t
    SOURCES[tid] = sources
    for s in sources:
        _save_source(tid, s)
    save(t)
    ledger.audit("Transformation created", tid, actor=op, actor_type="user", transformation_id=tid,
                 detail=f"{len(sources)} source(s); outputs: {', '.join(outputs)}")
    for s in sources:
        ledger.audit("Source uploaded", s.name, actor=op, actor_type="user", transformation_id=tid,
                     detail=f"sha256 {s.sha256[:16]}… · {s.size_bytes} bytes")
    return t


def _add_verification_tasks(t: dict, writer_ids: list[str]) -> None:
    c = _task(t, "output_security", "Security Agent", "Scan outputs · audience policy", "security",
              "Scan each artefact and apply the release policy for its audience", "policy_engine", writer_ids)
    k = _task(t, "consistency", "Consistency Agent", "Cross-output consistency", "verify",
              "Check every artefact states the same value for each claim", "deterministic_verifier", writer_ids)
    r = _task(t, "red_team", "Red Team / Critic Agent", "Adversarial review", "verify",
              "Attack outputs for drift, unsupported claims, leaks and uncertainty violations", "deterministic_verifier",
              [k["id"], c["id"]])
    p = _task(t, "provenance", "Provenance Agent", "Record provenance", "approval",
              "Hash sources, evidence, contract and outputs into the ledger", "hash_chain", [r["id"]])
    _task(t, "approval", "Human Reviewer", "Human approval", "approval",
          "Approve, request changes or reject each artefact", "human", [p["id"]])


async def _timed(tk: dict, coro):
    try:
        data, usage = await coro
        tk["model"] = usage.get("model")
        tk["tokens"] += int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        return data
    except EngineError as e:
        tk["error"] = str(e)
    except Exception as e:  # noqa: BLE001 - any agent failure is surfaced on its own task
        log.exception("task %s failed", tk["key"])
        tk["error"] = f"{type(e).__name__}: {e}"[:300]
    return None


async def run(tid: str) -> None:
    t = T[tid]
    t0 = time.perf_counter()
    try:
        await asyncio.gather(*(_understand(t, s) for s in SOURCES[tid]))
        _screen_sources(t)
        save(t)
        if not await _extract_evidence(t):
            t["status"] = "failed"
            t["error"] = task(t, "evidence")["error"] or "Evidence extraction failed."
            for x in t["tasks"]:
                if x["status"] == "queued":
                    x.update(status="blocked", detail="Blocked: no evidence state")
            return
        _plan(t)
        save(t)
        await asyncio.gather(*(_write(t, o) for o in list(t["artifacts"])))
        await _finalise(t)
        t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "result",
                              "text": _result_text(t)})
    except Exception as e:  # noqa: BLE001
        log.exception("transformation %s crashed", tid)
        t["status"], t["error"] = "failed", f"{type(e).__name__}: {e}"[:300]
        ledger.audit("Transformation failed", tid, status="failed", transformation_id=tid, detail=t["error"])
    finally:
        t["total_seconds"] = round(time.perf_counter() - t0, 1)
        save(t)


async def _understand(t: dict, s: Source) -> None:
    tk = task(t, f"source:{s.id}")
    _start(tk, "Parsing source")
    await asyncio.sleep(0.4)
    try:
        if s.media is not None:
            if LIVE:
                tk["detail"] = "Running perception (vision / speech)"
                observed, usage = await perception.perceive(LIVE, s)
                s.text = (s.text + "\n\n" + observed).strip()
                tk["model"] = usage.get("model")
            elif not s.text:
                s.text = f"Uploaded {s.kind} file: {s.name}."
                s.notes.append("Offline mode: media content cannot be read without a model gateway.")
        else:
            tk["model"] = "pypdf + pdfium (local)" if s.pdf else "local parser"
        desc = next(x for x in t["sources"] if x["id"] == s.id)
        desc.update(s.describe())
        desc["status"] = "parsed"
        _save_source(t["id"], s)
        pages = f"{len(s.pages)} pages · " if s.pages else ""
        _finish(tk, detail=f"{pages}{len(s.text.split()):,} words")
        ledger.audit("Source parsed", s.name, actor="Source Understanding Agent", actor_type="agent",
                     transformation_id=t["id"], detail=tk["detail"])
    except Exception as e:  # noqa: BLE001
        log.exception("source %s failed", s.name)
        next(x for x in t["sources"] if x["id"] == s.id)["status"] = "failed"
        _finish(tk, "failed", "Source processing failed", error=f"{type(e).__name__}: {e}"[:300])


def _screen_sources(t: dict) -> None:
    tk = task(t, "source_security")
    _start(tk, "Scanning sources")
    st = settings.get()
    findings, injections, notes = [], [], []
    MODEL_TEXT[t["id"]] = {}
    for s in SOURCES[t["id"]]:
        for f in security.scan_text(s.text):
            f.update(source_id=s.id, source_name=s.name, page=s.page_of(f["span"][0]))
            findings.append(f)
        inj = security.detect_injection(s.text)
        for i in inj:
            i.update(source_id=s.id, source_name=s.name, page=s.page_of(i["span"][0]))
        injections += inj
        text = s.text
        if st["neutralise_injection"] or st["withhold_credentials"]:
            text, n = security.sanitise_for_model(s.text, inj if st["neutralise_injection"] else [])
            if not st["withhold_credentials"]:
                text = security.sanitise_for_model(s.text, inj)[0] if inj else s.text
            notes += [f"{s.name}: {x}" for x in n]
        MODEL_TEXT[t["id"]][s.id] = text
    uniq = {(f["class"], f["text"]) for f in findings}
    summ = {k: 0 for k in security.CLASS_LABEL}
    for cls, _ in uniq:
        summ[cls] += 1
    summ["injection"] = len(injections)
    t["security"].update(source_findings=findings, injections=injections, summary=summ, model_context_notes=notes,
                         status="review" if (injections or summ["credential"] or summ["marking"]) else "passed")
    n = len(uniq)
    _finish(tk, "completed", f"{n} sensitive item(s) · {len(injections)} injection attempt(s)")
    ledger.audit("Source security scan completed", t["title"], actor="Security Agent", actor_type="agent",
                 transformation_id=t["id"], status="warning" if injections or n else "success",
                 detail="; ".join(f"{security.CLASS_LABEL[k]}: {v}" for k, v in summ.items() if v) or "No findings")
    for i in injections:
        ledger.audit("Prompt injection detected", i["source_name"], actor="Security Agent", actor_type="agent",
                     transformation_id=t["id"], status="warning",
                     detail=f"Ignored as untrusted source content (page {i['page'] or '-'})")


async def _brief_for(t: dict, s: Source, tk: dict) -> dict | None:
    text = MODEL_TEXT[t["id"]].get(s.id, s.text)
    if t["engine"]["route"] == "live" and LIVE:
        user = prompts.ANALYST_USER.format(
            outputs=", ".join(OUTPUT_TYPES[o]["label"] for o in t["artifacts"]),
            audience=audience_text(t["params"]), objective=t["params"]["objective"])
        user += f"\n\nSOURCE ({s.kind}: {s.name})\n<<<SOURCE_START\n{text}\nSOURCE_END>>>"
        brief = await _timed(tk, LIVE.generate_json(prompts.ANALYST_SYSTEM, user, BRIEF_SCHEMA, 0.1))
        if brief is not None:
            return brief
        t["engine"]["fallback"] = f"Evidence extraction: {tk['error']}"
        ledger.audit("Model call failed; offline fallback", s.name, actor="Orchestrator", actor_type="agent",
                     status="warning", transformation_id=t["id"], detail=tk["error"] or "")
        tk["error"] = None
    return await _timed(tk, SCRIPTED.brief(text))


async def _extract_evidence(t: dict) -> bool:
    tk = task(t, "evidence")
    srcs = [s for s in SOURCES[t["id"]] if s.text]
    _start(tk, f"Reading {len(srcs)} source(s)")
    done = 0

    async def one(s: Source):
        nonlocal done
        b = await _brief_for(t, s, tk)
        done += 1
        tk["progress"] = int(10 + 60 * done / max(len(srcs), 1))
        tk["detail"] = f"Extracted {done}/{len(srcs)} source(s)"
        return s, b

    results = await asyncio.gather(*(one(s) for s in srcs))
    per_source = []
    for i, (s, b) in enumerate(results):
        if not b:
            continue
        t["briefs"][s.id] = b
        injections = [x for x in t["security"]["injections"] if x["source_id"] == s.id]
        per_source.append(ev.claims_from_brief(s, b, injections, 1 + 100 * i, tk.get("model")))
    if not per_source:
        _finish(tk, "failed", "Evidence extraction failed", error=tk["error"] or "No evidence could be extracted.")
        return False
    tk["detail"] = "Verifying quotes against sources"
    tk["progress"] = 85
    claims, conflicts = ev.merge_sources(per_source)
    ev.reconcile_modality(claims, SOURCES[t["id"]])
    t["claims"], t["source_conflicts"] = claims, conflicts
    primary = t["briefs"].get("S1") or next(iter(t["briefs"].values()))
    t["title"] = primary.get("title") or t["title"]
    t["summary"] = primary.get("summary", "")
    t["provenance"]["evidence_hash"] = _evidence_hash(t)
    counts = {k: sum(1 for c in claims if c["status"] == k) for k in ("verified", "needs_review", "unsupported", "conflict")}
    status = "needs_review" if conflicts else "completed"
    _finish(tk, status, f"{len(claims)} claims · {counts['verified']} verified"
            + (f" · {len(conflicts)} source conflict(s)" if conflicts else ""))
    ledger.audit("Evidence extraction completed", t["title"], actor="Evidence Extraction Agent", actor_type="agent",
                 transformation_id=t["id"], status="warning" if conflicts or counts["unsupported"] else "success",
                 detail=", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in counts.items() if v))
    for sc in conflicts:
        ledger.audit("Source conflict detected", sc["attribute"], actor="Evidence Extraction Agent", actor_type="agent",
                     transformation_id=t["id"], status="warning",
                     detail=" vs ".join(f"{v['source_name']}: {v['value']}" for v in sc["values"]) + " · unresolved")
    return True


def _evidence_hash(t: dict) -> str:
    return ledger.canonical_hash([{k: c[k] for k in ("claim_id", "value", "normalized", "modality", "source_id",
                                                      "page", "char_span", "status", "version")} for c in t["claims"]])


def _plan(t: dict) -> None:
    tk = task(t, "plan")
    _start(tk, "Selecting agents")
    agents = sorted({a["agent"] for a in t["artifacts"].values()})
    tk["model"] = "rule-based"
    lang = t["params"]["language"]
    extra = f" · {lang} output" if lang != "English" else ""
    _finish(tk, detail=f"{len(agents)} specialist agent(s) · {len(t['artifacts'])} parallel{extra}")
    t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "plan",
                          "text": "I'll analyse the source and generate the requested artefacts. Every factual statement "
                                  "will be locked to the evidence ledger, verified, security-checked and routed to you for approval."})


# ---------------------------------------------------------------------------
# Specialist agents
# ---------------------------------------------------------------------------
def _source_for_model(t: dict) -> str:
    parts = []
    for s in SOURCES[t["id"]]:
        parts.append(f"[{s.id} · {s.name}]\n{MODEL_TEXT[t['id']].get(s.id, '')}")
    return "\n\n".join(parts)


async def _write(t: dict, otype: str, revise: dict | None = None, reason: str = "Initial generation",
                 tk: dict | None = None) -> bool:
    art = t["artifacts"][otype]
    tk = tk or task(t, f"write:{otype}")
    params = t["params"]
    meta = OUTPUT_TYPES[otype]
    art["status"] = "queued"
    async with _sem:
        art["status"] = "generating"
        _start(tk, "Generating from evidence ledger")
        data = None
        fell_back = False
        if t["engine"]["route"] == "live" and LIVE:
            prompt = prompts.build_writer_prompt(otype, meta, params, t["claims"], t["source_conflicts"],
                                                 t["summary"], _source_for_model(t), revise)
            data = await _timed(tk, LIVE.generate_json(prompts.WRITER_SYSTEM, prompt, meta["schema"],
                                                       TEMPERATURE.get(params["tone"], 0.35)))
            if data is None:
                t["engine"]["fallback"] = f"{meta['label']}: {tk['error']}"
                ledger.audit("Model call failed; offline fallback", meta["label"], actor="Orchestrator", actor_type="agent",
                             status="warning", transformation_id=t["id"], detail=tk["error"] or "")
                tk["error"] = None
                fell_back = True
        if data is None:
            brief = t["briefs"].get("S1") or next(iter(t["briefs"].values()), {})
            data = await _timed(tk, SCRIPTED.write(otype, brief, params, _corpus(t)))
    if data is None:
        art["status"] = "failed"
        art["error"] = tk["error"]
        _finish(tk, "failed", "Agent execution interrupted", error=tk["error"])
        ledger.audit("Agent execution failed", meta["label"], actor=meta["agent"], actor_type="agent", status="failed",
                     transformation_id=t["id"], detail=tk["error"] or "")
        return False
    art["format_warnings"] = quality.check_and_repair(otype, data, params)
    _new_version(t, otype, data, author=meta["agent"], model=tk.get("model"), reason=reason)
    _finish(tk, "needs_review" if fell_back else "completed",
            f"v{art['version']} generated" + (" · OFFLINE FALLBACK (live model unavailable)" if fell_back else ""))
    ledger.audit(f"{meta['label']} generated", f"{meta['label']} v{art['version']}", actor=meta["agent"], actor_type="agent",
                 transformation_id=t["id"], detail=reason)
    _check_one(t, otype)
    save(t)
    return True


def _new_version(t: dict, otype: str, content: dict, author: str, model: str | None, reason: str) -> None:
    art = t["artifacts"][otype]
    art["version"] += 1
    art["content"] = content
    art["output_hash"] = ledger.canonical_hash(content)
    art["versions"].append({"version": art["version"], "created_at": ledger.now(), "author": author, "model": model,
                            "reason": reason, "hash": art["output_hash"], "content": copy.deepcopy(content)})
    art["stale"] = None
    art["error"] = None
    if art["approval"]["status"] != "pending":
        art["approval"]["history"].append({k: art["approval"][k] for k in ("status", "by", "at", "comment")})
    art["approval"].update(status="pending", by=None, at=None, comment="")


def _check_one(t: dict, otype: str) -> None:
    """Verify + security-scan one artefact as soon as it lands."""
    art = t["artifacts"][otype]
    art["verification"] = verify.verify_artifact(art["content"], t["claims"], _corpus(t))
    sec, released = security.scan_artifact(otype, art["content"], audience_text(t["params"]), t["params"]["classification"])
    art["security"], art["released"] = sec, released
    tk = task(t, "output_security")
    scanned = sum(1 for a in t["artifacts"].values() if a.get("security") and a["status"] not in ("queued", "generating"))
    scanned = max(scanned, sum(1 for a in t["artifacts"].values() if a.get("security")))
    if tk["status"] == "queued":
        _start(tk, "Scanning artefacts")
    tk["progress"] = int(100 * scanned / max(len(t["artifacts"]), 1))
    tk["detail"] = f"{scanned}/{len(t['artifacts'])} artefacts scanned"
    _derive(art)


def _derive(art: dict) -> None:
    if art["content"] is None:
        return
    appr = art["approval"]["status"]
    if appr == "approved":
        art["status"] = "exported" if art["exported"] and art["exported"][-1]["version"] == art["version"] else "approved"
    elif appr == "rejected":
        art["status"] = "rejected"
    elif art.get("stale"):
        art["status"] = "stale"
    elif (art.get("security") or {}).get("blocked"):
        art["status"] = "blocked"
    elif (art.get("red_team") or {}).get("status") == "failed" or (art.get("verification") or {}).get("status") == "failed":
        art["status"] = "needs_review"
    elif (art.get("verification") or {}).get("status") == "needs_review" or (art.get("security") or {}).get("review_required"):
        art["status"] = "needs_review"
    else:
        art["status"] = "verified" if art.get("red_team") else "generated"


async def _finalise(t: dict, reason: str = "") -> None:
    """Consistency -> red team -> provenance -> human review. Re-run after any change."""
    live = {k: a for k, a in t["artifacts"].items() if a["content"] is not None}
    sec_t = task(t, "output_security")
    if sec_t["status"] != "running":
        _start(sec_t, "Scanning artefacts")
    for otype in live:
        if live[otype].get("security") is None:
            _check_one(t, otype)
    blocked = sum(1 for a in live.values() if a["security"]["blocked"])
    masked = sum(a["security"]["actions"].get(x, 0) for a in live.values() for x in ("MASK", "REDACT", "RESTRICT"))
    _finish(sec_t, "needs_review" if blocked else "completed",
            f"{masked} item(s) masked/redacted" + (f" · {blocked} artefact(s) blocked" if blocked else ""))
    ledger.audit("Output security scan completed", t["title"], actor="Security Agent", actor_type="agent",
                 transformation_id=t["id"], status="warning" if blocked else "success",
                 detail=f"{masked} item(s) masked or redacted by audience policy; {blocked} blocked")
    if masked:
        ledger.audit("Redaction completed", t["title"], actor="Security Agent", actor_type="agent",
                     transformation_id=t["id"], detail=f"{masked} sensitive item(s) removed from released versions")

    k = task(t, "consistency")
    _start(k, "Comparing claims across outputs")
    await asyncio.sleep(0.3)
    conflicts = verify.consistency(live, t["claims"])
    t["consistency"] = {"status": "failed" if conflicts else "passed", "conflicts": conflicts, "checked_at": ledger.now(),
                        "claims_compared": len({c for a in live.values() for c in a["verification"]["claims_used"]})}
    _finish(k, "completed", f"{len(conflicts)} conflict(s)" if conflicts else "Passed · no conflicts")
    ledger.audit("Consistency verification " + ("found conflicts" if conflicts else "passed"), t["title"],
                 actor="Consistency Agent", actor_type="agent", transformation_id=t["id"],
                 status="warning" if conflicts else "success",
                 detail="; ".join(f"{c['claim_id']} {c['attribute']}: " + ", ".join(c["affected"]) for c in conflicts))

    r = task(t, "red_team")
    _start(r, "Attacking outputs")
    await asyncio.sleep(0.3)
    totals = {"factual_drift": 0, "unsupported_claims": 0, "cross_output_conflicts": len(conflicts),
              "security_leaks": 0, "uncertainty_violations": 0}
    for otype, a in live.items():
        a["red_team"] = verify.red_team(a, conflicts, otype)
        for key in ("factual_drift", "unsupported_claims", "security_leaks", "uncertainty_violations"):
            totals[key] += a["red_team"][key]
        _derive(a)
    failed = [a["label"] for a in live.values() if a["red_team"]["status"] == "failed"]
    t["red_team"] = {**totals, "status": "failed" if any(totals.values()) else "passed", "checked_at": ledger.now(),
                     "failed_artifacts": failed}
    _finish(r, "completed", "Passed" if not failed else f"Issues in {len(failed)} artefact(s)")
    ledger.audit("Red team review " + ("passed" if not failed else "flagged issues"), t["title"],
                 actor="Red Team / Critic Agent", actor_type="agent", transformation_id=t["id"],
                 status="success" if not failed else "warning",
                 detail=", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in totals.items()))

    p = task(t, "provenance")
    _start(p, "Hashing into ledger")
    t["provenance"]["evidence_hash"] = _evidence_hash(t)
    entry = ledger.record("transformation_state", t["id"], {
        "source_hashes": t["provenance"]["source_hashes"], "contract_hash": t["provenance"]["contract_hash"],
        "evidence_state_hash": t["provenance"]["evidence_hash"],
        "outputs": {k: {"version": a["version"], "output_hash": a["output_hash"], "agent": a["agent"],
                        "model": (a["versions"][-1]["model"] if a["versions"] else None)} for k, a in live.items()},
        "reason": reason or "Verification cycle completed"})
    t["provenance"]["ledger_entries"].append(entry["index"])
    _finish(p, detail=f"Ledger entry #{entry['index']} · {entry['entry_hash'][:10]}…")

    ap = task(t, "approval")
    _refresh_approval(t, ap)
    save(t)


def _refresh_approval(t: dict, ap: dict | None = None) -> None:
    ap = ap or task(t, "approval")
    arts = [a for a in t["artifacts"].values() if a["content"] is not None]
    decided = [a for a in arts if a["approval"]["status"] in ("approved", "rejected")]
    approved = [a for a in arts if a["approval"]["status"] == "approved"]
    if arts and len(decided) == len(arts):
        ap.update(status="completed", progress=100, detail=f"{len(approved)}/{len(arts)} approved", ended=ledger.now())
        t["status"] = "approved" if len(approved) == len(arts) else "reviewed"
    else:
        if ap["status"] != "needs_review":
            ap.update(status="needs_review", started=ap["started"] or ledger.now())
        ap["progress"] = int(100 * len(decided) / max(len(arts), 1))
        ap["detail"] = f"Awaiting review · {len(approved)}/{len(arts)} approved"
        running = any(x["status"] == "running" for x in t["tasks"])
        t["status"] = "running" if running else "awaiting_review"
    if any(a["status"] == "failed" for a in t["artifacts"].values()) and t["status"] == "awaiting_review":
        t["status"] = "partial"


def _images_dir(tid: str, otype: str):
    d = _dir(tid) / "images" / otype
    d.mkdir(parents=True, exist_ok=True)
    return d


def illustration_path(tid: str, otype: str, slot: str):
    return _dir(tid) / "images" / otype / f"{slot}.jpg"


async def illustrate(t: dict, otype: str) -> None:
    """Visual Agent: generate illustrative images for one artefact from its writer's visual briefs."""
    a = t["artifacts"][otype]
    domain = next((b.get("domain", "") for b in t["briefs"].values() if b.get("domain")), "")
    plan = imagegen.slots(otype, a["content"] or {}, domain)
    tk = _task(t, f"illustrate:{otype}", "Visual Agent", f"Illustrate {a['label']}", "generate",
               "Generate illustrative images from the artefact's visual suggestions", "image_generation", [], artifact=otype)
    _start(tk, f"0/{len(plan)} images")
    tk["model"] = config.IMAGE_MODEL
    save(t)
    made, errors, fresh = [], [], []
    for i, sl in enumerate(plan, 1):
        director_input, removed = imagegen.art_brief(sl["brief"], sl["topic"])
        try:
            if LIVE:  # the art director turns the topic into a concrete, wordless photographic scene
                scene, _ = await LIVE.generate_json(imagegen.ART_DIRECTOR, director_input, imagegen.SCENE_SCHEMA, 0.7)
                prompt = imagegen.scene_prompt(scene.get("scene", ""))
            else:
                prompt, removed = imagegen.build_prompt(sl["brief"], sl["topic"])
            img = await imagegen.generate(prompt, sl["aspect"])
        except EngineError as e:
            errors.append(str(e))
            break
        (_images_dir(t["id"], otype) / f"{sl['slot']}.jpg").write_bytes(img)
        digest = ledger.canonical_hash(img.hex())
        fresh.append({"slot": sl["slot"], "label": sl["label"], "brief": sl["brief"], "prompt": prompt, "removed": removed,
                      "model": config.IMAGE_MODEL, "sha256": digest, "created_at": ledger.now(), "bytes": len(img)})
        # the new set replaces the old one; slots that are no longer planned are removed
        a["illustrations"] = fresh + [x for x in a.get("illustrations", [])
                                      if x["slot"] not in {f["slot"] for f in fresh} and x["slot"] in {p["slot"] for p in plan}]
        made.append({"slot": sl["slot"], "sha256": digest})
        tk["progress"] = int(100 * i / max(len(plan), 1))
        tk["detail"] = f"{i}/{len(plan)} images"
        save(t)
    if made:
        keep = {x["slot"] for x in a["illustrations"]}
        for f in _images_dir(t["id"], otype).glob("*.jpg"):
            if f.stem not in keep:
                f.unlink(missing_ok=True)
        entry = ledger.record("illustration", t["id"], {"artifact": otype, "version": a["version"], "model": config.IMAGE_MODEL,
                                                         "images": made})
        t["provenance"]["ledger_entries"].append(entry["index"])
        if a["approval"]["status"] == "approved":
            a["approval"]["history"].append({k: a["approval"][k] for k in ("status", "by", "at", "comment")})
            a["approval"].update(status="pending", by=None, at=None, comment="")
            _derive(a)
    if errors and not made:
        _finish(tk, "failed", "Image generation failed", error=errors[0])
    else:
        _finish(tk, "completed", f"{len(made)} illustration(s)" + (f" · stopped: {errors[0][:60]}" if errors else ""))
    ledger.audit("Illustrations generated" if made else "Illustration failed", a["label"], actor="Visual Agent", actor_type="agent",
                 transformation_id=t["id"], status="success" if made and not errors else ("warning" if made else "failed"),
                 detail=f"{len(made)} image(s) via {config.IMAGE_MODEL}; prompts scrubbed of sensitive data and figures"
                        + (f"; {errors[0]}" if errors else ""))
    _refresh_approval(t)
    save(t)


def video_path(tid: str):
    return _dir(tid) / "video" / "pramaan-video.mp4"


def narration_issues(t: dict) -> list[str]:
    """Spoken lines must be verified: drift, unsupported or over-certain narration blocks rendering."""
    a = t["artifacts"].get("video") or {}
    refs = (a.get("verification") or {}).get("refs", [])
    return [r["sentence"] for r in refs if "narration" in r["path"] and r["status"] in ("drift", "unsupported", "uncertainty")]


async def render_video(t: dict) -> None:
    """Video Production Agent: one narrated, subtitled MP4 from the verified, released video package."""
    import hashlib
    a = t["artifacts"]["video"]
    content = a["released"] or a["content"] or {}
    scenes = [s for s in content.get("scenes", []) if (s.get("narration") or "").strip()]
    tk = _task(t, "render:video", "Video Production Agent", "Render narrated MP4", "generate",
               "Motion clips or animated stills, verified narration, subtitles, stitched into one MP4",
               "video_production", [], artifact="video")
    _start(tk, f"Preparing {len(scenes)} scenes")
    tk["model"] = config.TTS_MODEL + (f" + {config.VIDEO_MODEL}" if videogen.motion_available() else "")
    save(t)
    base = _dir(t["id"]) / "video"
    work = base / "work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    videogen.watermark(work / "watermark.png")
    domain = next((b.get("domain", "") for b in t["briefs"].values() if b.get("domain")), "")
    stills = {x["slot"]: x for x in a.get("illustrations", [])}
    sem = asyncio.Semaphore(3)
    done = 0
    motion_off: dict = {"reason": None if videogen.motion_available() else "no motion model configured"}
    voice_off: dict = {"reason": None}

    async def prep(i: int, s: dict) -> dict:
        nonlocal done
        async with sem:
            n = s.get("scene_number", i + 1)
            spoken = videogen.speakable(s["narration"])
            audio = work / f"audio-{i:02d}.mp3"
            if not voice_off["reason"]:
                try:
                    audio.write_bytes(await videogen.narrate(spoken))
                except EngineError as e:
                    voice_off["reason"] = str(e)  # e.g. daily quota: render silently with subtitles instead of failing
            if voice_off["reason"]:
                await asyncio.to_thread(videogen.silence, videogen.reading_seconds(spoken), audio)
            director_input, _ = imagegen.art_brief(s.get("visual_description", ""), f"{domain}: {s.get('title', '')}")
            prompt = ""
            if LIVE:
                try:
                    scene, _ = await LIVE.generate_json(imagegen.ART_DIRECTOR, director_input, imagegen.SCENE_SCHEMA, 0.7)
                    prompt = imagegen.scene_prompt(scene.get("scene", ""))
                except EngineError:
                    prompt = ""
            if not prompt:
                prompt = imagegen.build_prompt(s.get("visual_description", ""), f"{domain}: {s.get('title', '')}")[0]
            source = "still"
            visual = work / f"visual-{i:02d}.jpg"
            clip = None
            if not motion_off["reason"] and i < config.VIDEO_MOTION_MAX:
                clip, why = await videogen.motion_clip(prompt + " Slow, steady cinematic camera movement.")
                if why and ("balance" in why or "401" in why or "403" in why):
                    motion_off["reason"] = why  # account-level problem: don't spend a request on every scene
                elif why:
                    log.warning("motion clip for scene %s failed: %s", n, why)
            if clip:
                visual = work / f"visual-{i:02d}.mp4"
                visual.write_bytes(clip)
                source = "motion"
            elif f"scene-{n}" in stills and illustration_path(t["id"], "video", f"scene-{n}").exists():
                shutil.copy(illustration_path(t["id"], "video", f"scene-{n}"), visual)
            elif imagegen.available():
                try:
                    visual.write_bytes(await imagegen.generate(prompt, 16 / 9))
                except EngineError:
                    videogen.title_still(s.get("title", ""), visual)
                    source = "title card"
            else:
                videogen.title_still(s.get("title", ""), visual)
                source = "title card"
            done += 1
            tk["progress"] = int(5 + 45 * done / len(scenes))
            tk["detail"] = f"Scenes prepared {done}/{len(scenes)}"
            return {"i": i, "scene": n, "title": s.get("title", ""), "spoken": spoken, "audio": audio, "visual": visual,
                    "source": source, "prompt": prompt}

    try:
        if not scenes:
            raise EngineError("The video package has no narrated scenes.")
        prepared = sorted(await asyncio.gather(*(prep(i, s) for i, s in enumerate(scenes))), key=lambda x: x["i"])
        segments, clock = [], 0.0
        for k, p in enumerate(prepared, 1):
            tk["detail"] = f"Encoding scene {k}/{len(prepared)}"
            seg, seg_len, caps = await asyncio.to_thread(videogen.render_segment, work, p["i"], p["visual"],
                                                         p["source"] == "motion", p["audio"], p["spoken"])
            segments.append(seg)
            p.update(start=round(clock, 2), end=round(clock + seg_len, 2), captions=[[c[0], round(c[1], 2), round(c[2], 2)] for c in caps])
            clock += seg_len
            tk["progress"] = int(50 + 45 * k / len(prepared))
        tk["detail"] = "Joining scenes"
        out = video_path(t["id"])
        length = await asyncio.to_thread(videogen.stitch, work, segments, work / "final.mp4")
        shutil.move(str(work / "final.mp4"), out)
        data = out.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        a["video_render"] = {
            "sha256": digest, "bytes": len(data), "seconds": round(length, 1), "created_at": ledger.now(),
            "artifact_version": a["version"], "resolution": f"{videogen.W}x{videogen.H}",
            "models": {"narration": config.TTS_MODEL, "motion": config.VIDEO_MODEL if videogen.motion_available() else None,
                       "stills": config.IMAGE_MODEL if imagegen.available() else None},
            "motion_note": motion_off["reason"],
            "narration_note": voice_off["reason"],
            "scenes": [{"scene": p["scene"], "title": p["title"], "source": p["source"], "prompt": p["prompt"],
                        "spoken": p["spoken"], "start": p["start"], "end": p["end"], "captions": p["captions"]} for p in prepared],
        }
        shutil.rmtree(work, ignore_errors=True)
        entry = ledger.record("video_render", t["id"], {"artifact": "video", "version": a["version"], "sha256": digest,
                                                        "seconds": a["video_render"]["seconds"],
                                                        "models": a["video_render"]["models"],
                                                        "scene_sources": [p["source"] for p in prepared]})
        t["provenance"]["ledger_entries"].append(entry["index"])
        if a["approval"]["status"] == "approved":
            a["approval"]["history"].append({k: a["approval"][k] for k in ("status", "by", "at", "comment")})
            a["approval"].update(status="pending", by=None, at=None, comment="")
            _derive(a)
        motion = sum(1 for p in prepared if p["source"] == "motion")
        _finish(tk, "completed", f"{length:.0f}s MP4 · {motion}/{len(prepared)} motion scenes"
                + (" · no narration (subtitles only)" if voice_off["reason"] else ""))
        ledger.audit("Video rendered", f"Video Package v{a['version']}", actor="Video Production Agent", actor_type="agent",
                     transformation_id=t["id"], detail=f"{length:.0f}s, {motion} motion / {len(prepared) - motion} still scenes; "
                                                       f"narration {config.TTS_MODEL}")
    except Exception as e:  # noqa: BLE001 - any failure is reported on the task, the rest of the run is untouched
        log.exception("video render failed")
        _finish(tk, "failed", "Video render failed", error=str(e)[:300])
        ledger.audit("Video render failed", "Video Package", actor="Video Production Agent", actor_type="agent",
                     transformation_id=t["id"], status="failed", detail=str(e)[:300])
    _refresh_approval(t)
    save(t)


def reset_for_retry(t: dict) -> None:
    """Re-run a failed transformation from its stored sources (same contract, fresh evidence)."""
    for x in t["tasks"]:
        if x["key"] != "contract":
            x.update(status="queued", progress=0, detail="Queued", started=None, ended=None, seconds=None,
                     model=None, tokens=0, error=None, _t0=None)
    t["claims"], t["source_conflicts"], t["briefs"] = [], [], {}
    t["artifacts"] = {o: _new_artifact(o) for o in t["artifacts"]}
    t["consistency"] = {"status": "pending", "conflicts": [], "checked_at": None}
    t["red_team"] = {"status": "pending"}
    t["status"], t["error"] = "running", None
    t["engine"] = _engine_info()
    ledger.audit("Transformation retried", t["id"], actor=settings.operator(), actor_type="user", transformation_id=t["id"])
    save(t)


def _result_text(t: dict) -> str:
    arts = t["artifacts"].values()
    ok = [a for a in arts if a["status"] == "verified"]
    review = [a for a in arts if a["status"] in ("needs_review", "blocked")]
    failed = [a for a in arts if a["status"] == "failed"]
    parts = [f"{len(ok) + len(review)} of {len(t['artifacts'])} artefacts generated and verified against "
             f"{len(t['claims'])} evidence claims."]
    if review:
        parts.append(f"{len(review)} need your attention before approval: " + ", ".join(a["label"] for a in review) + ".")
    if failed:
        parts.append("Failed: " + ", ".join(a["label"] for a in failed) + ". Completed artefacts remain available.")
    if t["source_conflicts"]:
        parts.append(f"{sum(1 for c in t['source_conflicts'] if c['status'] == 'unresolved')} source conflict(s) are unresolved.")
    parts.append("Nothing is released until you approve it.")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Human actions
# ---------------------------------------------------------------------------
def _reverify_all(t: dict) -> None:
    for otype, a in t["artifacts"].items():
        if a["content"] is not None:
            _check_one(t, otype)


def _regen_tasks(t: dict, otypes: list[str], reason: str) -> dict[str, dict]:
    tasks = {}
    writer_ids = []
    for o in otypes:
        x = _task(t, f"write:{o}", OUTPUT_TYPES[o]["agent"], f"Regenerate {OUTPUT_TYPES[o]['label']}", "generate",
                  reason, "text_reasoning", [], artifact=o)
        tasks[o] = x
        writer_ids.append(x["id"])
        t["artifacts"][o]["status"] = "queued"
    _add_verification_tasks(t, writer_ids)
    t["status"] = "running"
    return tasks


async def regenerate(t: dict, otypes: list[str], instruction: str, reason: str, deterministic: dict | None = None) -> None:
    """Regenerate only the given artefacts, then re-run the verification cycle.

    deterministic: {"old": [surfaces], "new": value} performs an exact value repair instead of a model call.
    """
    tasks = _regen_tasks(t, otypes, reason)
    save(t)

    async def one(o: str):
        a = t["artifacts"][o]
        if deterministic and a["content"] is not None:
            tk = tasks[o]
            _start(tk, "Repairing values from evidence ledger")
            await asyncio.sleep(0.5)
            content = _replace_values(copy.deepcopy(a["content"]), deterministic["old"], deterministic["new"])
            _new_version(t, o, content, author="Orchestrator (repair)", model="deterministic", reason=reason)
            tk["model"] = "deterministic repair"
            _finish(tk, detail=f"v{a['version']} repaired")
            ledger.audit(f"{a['label']} repaired", f"{a['label']} v{a['version']}", actor="Orchestrator",
                         actor_type="agent", transformation_id=t["id"], detail=reason)
            _check_one(t, o)
        else:
            revise = {"instruction": instruction, "previous": a["content"]} if instruction and a["content"] else None
            await _write(t, o, revise, reason, tasks[o])

    await asyncio.gather(*(one(o) for o in otypes))
    _reverify_all(t)
    await _finalise(t, reason)


def _replace_values(obj, old: list[str], new: str):
    if isinstance(obj, str):
        for o in sorted(set(old), key=len, reverse=True):
            if o:
                obj = re.sub(re.escape(o), new, obj)
        return obj
    if isinstance(obj, dict):
        return {k: _replace_values(v, old, new) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_values(v, old, new) for v in obj]
    return obj


def dependents(t: dict, claim_id: str) -> list[str]:
    return [o for o, a in t["artifacts"].items()
            if a.get("verification") and claim_id in a["verification"]["claims_used"]]


def update_claim(t: dict, claim_id: str, value: str | None, modality: str | None, note: str) -> dict:
    c = next(x for x in t["claims"] if x["claim_id"] == claim_id)
    op = settings.operator()
    before = {k: c[k] for k in ("value", "display_value", "modality", "status")}
    deps = dependents(t, claim_id)
    old_surfaces = {c["display_value"], c["value"]}
    for a in t["artifacts"].values():
        for r in (a.get("verification") or {}).get("refs", []):
            if claim_id in r["claim_ids"]:
                if c["normalized"]["type"] == "date":
                    old_surfaces |= {d["surface"] for d in ev.parse_dates(r["sentence"], ev.doc_year(_corpus(t)))
                                     if d["iso"] == c["normalized"]["value"]}
    if value is not None and value.strip():
        year = ev.doc_year(_corpus(t))
        c["value"] = value.strip()
        c["normalized"] = ev.normalise(c["value"], year)
        c["display_value"] = ev.fmt_date(c["normalized"]["value"]) if c["normalized"]["type"] == "date" else c["value"]
    if modality and modality in ev.MODALITY_RANK:
        c["modality"] = modality
    c["version"] += 1
    c["status"] = "human_verified"
    c["grounding_note"] = f"Updated by {op}: {note or 'no note'}"
    c["history"].append({"version": c["version"], "at": ledger.now(), "by": op, "before": before, "note": note,
                         "dependents": len(deps), "total_artifacts": len(t["artifacts"])})
    t["provenance"]["evidence_hash"] = _evidence_hash(t)
    for o in deps:
        t["artifacts"][o]["stale"] = {"claim_id": claim_id, "reason": f"{claim_id} changed: {before['display_value']} → {c['display_value']}",
                                      "old_surfaces": sorted(old_surfaces), "new_value": c["display_value"]}
    _reverify_all(t)
    for o in deps:
        _derive(t["artifacts"][o])
    entry = ledger.record("evidence_update", t["id"], {"claim_id": claim_id, "claim_version": c["version"],
                                                       "evidence_state_hash": t["provenance"]["evidence_hash"],
                                                       "dependents": deps}, actor=op)
    t["provenance"]["ledger_entries"].append(entry["index"])
    ledger.audit("Claim updated", claim_id, actor=op, actor_type="user", transformation_id=t["id"], status="warning",
                 detail=f"{before['display_value']} → {c['display_value']}; {len(deps)} dependent artefact(s)")
    save(t)
    return {"claim": c, "dependents": deps}


def resolve_source_conflict(t: dict, conflict_id: str, claim_id: str, note: str) -> list[str]:
    sc = next(x for x in t["source_conflicts"] if x["id"] == conflict_id)
    if claim_id not in sc["claim_ids"]:
        raise ValueError("Chosen claim is not part of this conflict.")
    op = settings.operator()
    for cid in sc["claim_ids"]:
        c = next(x for x in t["claims"] if x["claim_id"] == cid)
        c["status"] = "human_verified" if cid == claim_id else "superseded"
        c["grounding_note"] = (f"Chosen by {op} to resolve {conflict_id}" if cid == claim_id
                               else f"Superseded by {claim_id} ({op})") + (f": {note}" if note else "")
    winner = next(v for v in sc["values"] if v["claim_id"] == claim_id)
    sc.update(status="resolved", resolution={"claim_id": claim_id, "value": winner["value"], "source_name": winner["source_name"],
                                             "by": op, "at": ledger.now(), "note": note})
    t["provenance"]["evidence_hash"] = _evidence_hash(t)
    deps = sorted({o for cid in sc["claim_ids"] for o in dependents(t, cid)} |
                  {o for o, a in t["artifacts"].items() if a["content"] and verify.NEEDS_PLACEHOLDER.search(json.dumps(a["content"]))})
    for o in deps:
        t["artifacts"][o]["stale"] = {"claim_id": claim_id, "reason": f"{sc['attribute']} resolved to {winner['value']}",
                                      "old_surfaces": [], "new_value": winner["value"]}
        _derive(t["artifacts"][o])
    evt = task(t, "evidence")
    if evt and evt["status"] == "needs_review" and all(x["status"] == "resolved" for x in t["source_conflicts"]):
        evt.update(status="completed", detail=evt["detail"].split(" · ")[0] + " · conflicts resolved")
    ledger.record("source_conflict_resolved", t["id"], {"conflict_id": conflict_id, "claim_id": claim_id,
                                                        "evidence_state_hash": t["provenance"]["evidence_hash"]}, actor=op)
    ledger.audit("Source conflict resolved", sc["attribute"], actor=op, actor_type="user", transformation_id=t["id"],
                 detail=f"Chose {winner['value']} ({winner['source_name']}); {len(deps)} artefact(s) to regenerate")
    save(t)
    return deps


def edit_artifact(t: dict, otype: str, content: dict, note: str) -> None:
    op = settings.operator()
    _new_version(t, otype, content, author=op, model=None, reason=note or "Manual edit")
    ledger.audit("Artefact edited", f"{t['artifacts'][otype]['label']} v{t['artifacts'][otype]['version']}",
                 actor=op, actor_type="user", transformation_id=t["id"], detail=note or "Manual edit")


def simulate_drift(t: dict, otype: str) -> dict:
    """Demo control: change one evidence-locked date in an artefact, exactly like a careless manual edit."""
    a = t["artifacts"][otype]
    year = ev.doc_year(_corpus(t))
    for r in (a.get("verification") or {}).get("refs", []):
        for d in ev.parse_dates(r["sentence"], year):
            claim = next((c for c in t["claims"] if c["normalized"] == {"type": "date", "value": d["iso"]}), None)
            if not claim:
                continue
            from datetime import date, timedelta
            shifted = date.fromisoformat(d["iso"]) + timedelta(days=2)
            new_surface = f"{shifted.day} {shifted.strftime('%B')}" + (f" {shifted.year}" if re.search(r"\d{4}", d["surface"]) else "")
            content = copy.deepcopy(a["content"])
            content = _replace_at_path(content, r["path"], d["surface"], new_surface)
            _new_version(t, otype, content, author=f"{settings.operator()} (test edit)", model=None,
                         reason=f"Test drift: {d['surface']} → {new_surface}")
            ledger.audit("Test drift injected", f"{a['label']} v{a['version']}", actor=settings.operator(), actor_type="user",
                         transformation_id=t["id"], status="warning",
                         detail=f"Demo control changed {claim['claim_id']} {d['surface']} → {new_surface}")
            return {"claim_id": claim["claim_id"], "from": d["surface"], "to": new_surface, "path": r["path"]}
    raise ValueError("This artefact has no evidence-locked date to alter.")


def _replace_at_path(obj, path: str, old: str, new: str):
    tokens = re.findall(r"[^.\[\]]+|\[\d+\]", path)
    cur = obj
    for tkn in tokens[:-1]:
        cur = cur[int(tkn[1:-1])] if tkn.startswith("[") else cur[tkn]
    last = tokens[-1]
    key = int(last[1:-1]) if last.startswith("[") else last
    cur[key] = cur[key].replace(old, new, 1)
    return obj


def approve(t: dict, otype: str, decision: str, comment: str) -> dict:
    a = t["artifacts"][otype]
    op = settings.operator()
    if decision == "approve":
        if a.get("stale"):
            raise PermissionError("This artefact depends on changed evidence. Regenerate it before approval.")
        if (a.get("security") or {}).get("blocked"):
            raise PermissionError("Security policy blocks this artefact on its channel. Edit or regenerate it first.")
        if (a.get("red_team") or {}).get("status") == "failed":
            raise PermissionError("Verification found issues (drift, unsupported claims, conflicts or uncertainty). "
                                  "Repair them before approval.")
    status = {"approve": "approved", "reject": "rejected", "request_changes": "changes_requested"}[decision]
    if a["approval"]["status"] != "pending":
        a["approval"]["history"].append({k: a["approval"][k] for k in ("status", "by", "at", "comment")})
    a["approval"].update(status=status, by=op, at=ledger.now(), comment=comment)
    entry = ledger.record("approval", t["id"], {"artifact": otype, "version": a["version"], "output_hash": a["output_hash"],
                                                "decision": status, "evidence_state_hash": t["provenance"]["evidence_hash"]},
                          actor=op)
    t["provenance"]["ledger_entries"].append(entry["index"])
    a["approval"]["ledger_index"] = entry["index"]
    ledger.audit({"approved": "Human approval recorded", "rejected": "Artefact rejected",
                  "changes_requested": "Changes requested"}[status], f"{a['label']} v{a['version']}", actor=op,
                 actor_type="user", transformation_id=t["id"], status="success" if status == "approved" else "warning",
                 detail=comment)
    _derive(a)
    if status == "changes_requested":
        a["status"] = "needs_review"
    _refresh_approval(t)
    save(t)
    return a


def record_export(t: dict, otype: str, fmt: str) -> None:
    a = t["artifacts"][otype]
    a["exported"].append({"version": a["version"], "format": fmt, "at": ledger.now(), "by": settings.operator()})
    ledger.record("export", t["id"], {"artifact": otype, "version": a["version"], "format": fmt,
                                      "output_hash": a["output_hash"]}, actor=settings.operator())
    ledger.audit("Output exported", f"{a['label']} v{a['version']} · {fmt.upper()}", actor=settings.operator(),
                 actor_type="user", transformation_id=t["id"])
    _derive(a)
    save(t)


async def handle_message(t: dict, text: str) -> None:
    op = settings.operator()
    t["messages"].append({"role": "user", "author": op, "text": text, "ts": ledger.now()})
    ledger.audit("Instruction received", t["id"], actor=op, actor_type="user", transformation_id=t["id"], detail=text[:300])
    wanted = parse_outputs(text)
    new = [o for o in wanted if o not in t["artifacts"]]
    existing = [o for o in wanted if o in t["artifacts"] and t["artifacts"][o]["content"] is not None]
    revise = bool(REVISION_RX.search(text))
    if new:
        for o in new:
            t["artifacts"][o] = _new_artifact(o)
        t["contract"] = _contract(t)
        t["provenance"]["contract_hash"] = ledger.canonical_hash({k: v for k, v in t["contract"].items() if k != "signed_at"})
        reply = f"Adding {', '.join(OUTPUT_TYPES[o]['label'] for o in new)} under contract v{t['contract']['version']}. " \
                f"It will use the same evidence ledger ({len(t['claims'])} claims) and pass the same verification gates."
        t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "reply", "text": reply})
        save(t)
        await regenerate(t, new, "", "Added by follow-up request")
    targets = existing if existing else ([o for o, a in t["artifacts"].items() if a["content"] is not None] if revise and not new else [])
    if targets and revise:
        reply = f"Revising {', '.join(OUTPUT_TYPES[o]['label'] for o in targets)}. Only these artefacts are regenerated; " \
                "all others keep their approved versions."
        t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "reply", "text": reply})
        save(t)
        await regenerate(t, targets, text, f"Revision: {text[:120]}")
    elif not new:
        t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "reply",
                              "text": "I couldn't map that to an artefact or a revision. Name an output (e.g. 'add a LinkedIn post') "
                                      "or describe a change (e.g. 'make the executive summary shorter')."})
        save(t)
        return
    t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "result",
                          "text": _result_text(t)})
    save(t)


async def apply_contract(t: dict, params: dict) -> None:
    op = settings.operator()
    changed = {k: (t["params"].get(k), v) for k, v in params.items() if t["params"].get(k) != v}
    t["params"] = params
    t["contract"] = _contract(t)
    t["provenance"]["contract_hash"] = ledger.canonical_hash({k: v for k, v in t["contract"].items() if k != "signed_at"})
    ledger.audit("Contract updated", f"{t['id']} v{t['contract']['version']}", actor=op, actor_type="user",
                 transformation_id=t["id"], detail=", ".join(f"{k}: {a} → {b}" for k, (a, b) in changed.items()))
    t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "reply",
                          "text": f"Contract v{t['contract']['version']} signed ("
                                  + ", ".join(f"{k} → {b}" for k, (_, b) in changed.items())
                                  + "). Regenerating all artefacts against the same evidence ledger."})
    await regenerate(t, [o for o in t["artifacts"]], "", f"Contract v{t['contract']['version']}")
    t["messages"].append({"role": "orchestrator", "author": "Orchestrator", "ts": ledger.now(), "kind": "result",
                          "text": _result_text(t)})
    save(t)
