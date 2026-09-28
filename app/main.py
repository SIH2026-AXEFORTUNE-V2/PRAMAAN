"""PRAMAAN HTTP API and web app host."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import json
import logging
import re
import time

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, exporters, imagegen, ingest, ledger, orchestrator as orc, registry, settings
from .catalog import OUTPUT_TYPES, PARAMETERS, normalise_params

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pramaan")
app = FastAPI(title="PRAMAAN API", version=config.APP_VERSION,
              description="PRAMAAN · AI Transformation Workspace: evidence-controlled content transformation.")

DEMO_DIR = config.SAMPLES_DIR / "demo"
DEMO_SOURCES = [
    {"file": "Security_Assessment_Report.pdf", "description": "8-page fictional assessment: incident timeline, affected "
     "systems, hedged attribution, PII, a credential, confidential markings and an embedded prompt injection."},
    {"file": "Field_Office_Incident_Note.txt", "description": "Second fictional source that reports a different "
     "detection date. Add it to demonstrate source-conflict handling."},
]


# ---------------------------------------------------------------------------
# Access gate (PRAMAAN_ACCESS_PASSWORD). The app shell is public; every /api route needs a signed,
# HttpOnly session cookie issued by /api/auth/login. Basic credentials are accepted for API tooling,
# but no browser challenge is ever sent, so users only see the PRAMAAN sign-in screen.
# ---------------------------------------------------------------------------
SESSION_COOKIE = "pramaan_session"
SESSION_HOURS = 12
PUBLIC_API = {"/api/auth/login", "/api/auth/status", "/api/auth/logout"}


def _session_key() -> bytes:
    return hashlib.sha256(("pramaan-session:" + config.ACCESS_PASSWORD).encode()).digest()


def _issue_session() -> str:
    exp = int(time.time()) + SESSION_HOURS * 3600
    return f"{exp}.{hmac.new(_session_key(), str(exp).encode(), hashlib.sha256).hexdigest()}"


def _session_ok(token: str | None) -> bool:
    exp, _, mac = (token or "").partition(".")
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(mac, hmac.new(_session_key(), exp.encode(), hashlib.sha256).hexdigest())


def _basic_ok(header: str) -> bool:
    if not header.startswith("Basic "):
        return False
    try:
        _, _, password = base64.b64decode(header[6:]).decode("utf-8", "replace").partition(":")
    except ValueError:
        return False
    return hmac.compare_digest(password.encode(), config.ACCESS_PASSWORD.encode())


def _authenticated(request: Request) -> bool:
    return (not config.ACCESS_PASSWORD) or _session_ok(request.cookies.get(SESSION_COOKIE)) \
        or _basic_ok(request.headers.get("authorization", ""))


@app.middleware("http")
async def access_gate(request: Request, call_next):
    path = request.url.path
    if not config.ACCESS_PASSWORD or not path.startswith("/api/") or path in PUBLIC_API or _authenticated(request):
        return await call_next(request)
    return JSONResponse({"detail": "Sign in required.", "auth": "required"}, status_code=401)


class Login(BaseModel):
    password: str = Field(max_length=200)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    return {"enabled": bool(config.ACCESS_PASSWORD), "authenticated": _authenticated(request)}


@app.post("/api/auth/login")
async def auth_login(body: Login, request: Request):
    if not config.ACCESS_PASSWORD:
        return {"ok": True}
    if not hmac.compare_digest(body.password.encode(), config.ACCESS_PASSWORD.encode()):
        await asyncio.sleep(0.8)  # slow down guessing
        ledger.audit("Sign-in failed", "workspace", actor="Unknown", actor_type="user", status="warning")
        raise HTTPException(401, "Incorrect access password.")
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    resp = JSONResponse({"ok": True})
    resp.set_cookie(SESSION_COOKIE, _issue_session(), max_age=SESSION_HOURS * 3600, httponly=True,
                    samesite="lax", secure=secure, path="/")
    return resp


@app.post("/api/auth/logout")
async def auth_logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


@app.on_event("startup")
async def _startup() -> None:
    settings.load()
    ledger.load()
    orc.load_all()


def _t(tid: str) -> dict:
    t = orc.T.get(tid)
    if not t:
        raise HTTPException(404, "Transformation not found")
    return t


def _art(t: dict, otype: str) -> dict:
    a = t["artifacts"].get(otype)
    if not a:
        raise HTTPException(404, "Artefact not found")
    return a


def _idle(t: dict) -> None:
    if any(x["status"] == "running" for x in t["tasks"]) or any(
            a["status"] in ("queued", "generating") for a in t["artifacts"].values()):
        raise HTTPException(409, "Agents are still running on this transformation. Wait for them to finish.")


def _deployment() -> dict:
    if config.MODEL_GATEWAY_URL:
        return {"mode": "on_prem", "label": "On-Prem", "detail": "All model calls go to the self-hosted gateway."}
    if orc.LIVE:
        via = "GroqCloud" if config.LLM_PROVIDER == "groq" else "Hugging Face Inference Providers"
        return {"mode": "hybrid", "label": "Hybrid", "detail": f"App and data stay on this server; model inference uses {via}. "
                "Credentials and injected instructions are withheld from model context."}
    return {"mode": "offline", "label": "Offline", "detail": "No model gateway configured; offline extractive engine."}


# ---------------------------------------------------------------------------
# Config, registries
# ---------------------------------------------------------------------------
@app.get("/healthz")
async def health():
    return {"ok": True, "engine": orc.LIVE.mode if orc.LIVE else "offline"}


@app.get("/api/config")
async def get_config():
    st = settings.get()
    return {
        "app": config.APP_NAME, "descriptor": config.APP_DESCRIPTOR, "version": config.APP_VERSION,
        "engine": orc._engine_info(), "deployment": _deployment(),
        "secure_mode": {"enabled": True, "injection_defence": st["neutralise_injection"],
                        "credential_withholding": st["withhold_credentials"], "approval_gate": True},
        "max_upload_mb": config.MAX_UPLOAD_MB,
        "output_types": [{"key": k, "label": v["label"], "agent": v["agent"], "description": v["description"],
                          "exports": v["exports"]} for k, v in OUTPUT_TYPES.items()],
        "parameters": PARAMETERS,
        "operator": {"name": st["operator_name"], "role": st["operator_role"]},
        "image_generation": {"available": imagegen.available(), "model": config.IMAGE_MODEL if imagegen.available() else None},
        "workspace": st["workspace_name"],
    }


@app.get("/api/samples")
async def samples():
    out = []
    for s in DEMO_SOURCES:
        p = DEMO_DIR / s["file"]
        if p.exists():
            out.append({**s, "size_bytes": p.stat().st_size, "url": f"/api/samples/{s['file']}"})
    return out


@app.get("/api/samples/{name}")
async def sample_file(name: str):
    if name not in {s["file"] for s in DEMO_SOURCES}:
        raise HTTPException(404, "Unknown sample")
    return FileResponse(DEMO_DIR / name, filename=name)


@app.get("/api/agents")
async def agents():
    usage: dict[str, dict] = {}
    for t in orc.T.values():
        for x in t["tasks"]:
            u = usage.setdefault(x["agent"], {"runs": 0, "failed": 0, "last_run": None, "transformations": set()})
            if x["status"] in ("completed", "failed", "needs_review"):
                u["runs"] += 1
                u["failed"] += x["status"] == "failed"
                u["last_run"] = max(u["last_run"] or "", x["ended"] or "") or None
                u["transformations"].add(t["id"])
    rows = []
    for a in registry.AGENTS:
        u = usage.get(a["name"], {"runs": 0, "failed": 0, "last_run": None, "transformations": set()})
        rows.append({**a, "runs": u["runs"], "failed": u["failed"], "last_run": u["last_run"],
                     "transformations": len(u["transformations"])})
    return rows


@app.get("/api/models")
async def models():
    return {"deployment": _deployment(), "routes": registry.model_router(orc.LIVE)}


@app.get("/api/templates")
async def templates():
    return registry.TEMPLATES


@app.get("/api/connectors")
async def connectors():
    return registry.CONNECTORS


@app.get("/api/evaluation")
async def evaluation():
    return registry.evaluate(list(orc.T.values()))


@app.get("/api/settings")
async def get_settings():
    return {"values": settings.get(), "locked": sorted(settings.LOCKED)}


@app.put("/api/settings")
async def put_settings(body: dict):
    before = dict(settings.get())
    cur = settings.update(body)
    changed = [k for k in cur if before.get(k) != cur[k]]
    if changed:
        ledger.audit("Settings updated", ", ".join(changed), actor=settings.operator(), actor_type="user")
    return {"values": cur, "locked": sorted(settings.LOCKED)}


# ---------------------------------------------------------------------------
# Transformations
# ---------------------------------------------------------------------------
@app.post("/api/transformations")
async def create_transformation(
    outputs: str = Form(...), params: str = Form("{}"), request: str = Form(""), text: str = Form(""),
    url: str = Form(""), files: list[UploadFile] = File(default_factory=list),
):
    try:
        wanted = [o for o in json.loads(outputs) if o in OUTPUT_TYPES]
        raw_params = json.loads(params or "{}")
    except json.JSONDecodeError:
        raise HTTPException(400, "Malformed outputs or params")
    if not wanted:  # explicit selection wins; otherwise infer from the request text
        wanted = orc.parse_outputs(request)
    if not wanted:
        raise HTTPException(400, "Select at least one output, or name one in your request.")
    sources = []
    try:
        for f in files:
            if f.filename:
                sources.append(ingest.from_file(f.filename, await f.read(), f.content_type))
        if url.strip():
            sources.append(await ingest.from_url(url))
        if text.strip():
            sources.append(ingest.from_text(text))
    except ingest.IngestError as e:
        raise HTTPException(400, str(e))
    if not sources:
        raise HTTPException(400, "Add a source: upload a file, paste text or provide a URL.")
    p = normalise_params(raw_params)
    req = request.strip() or ("Generate " + ", ".join(OUTPUT_TYPES[o]["label"] for o in wanted) + " from this source.")
    t = orc.create(sources, wanted, p, req[:2000])
    orc.spawn(orc.run(t["id"]))
    return orc.serialize(t)


@app.get("/api/transformations")
async def list_transformations():
    return [orc.summary(t) for t in sorted(orc.T.values(), key=lambda x: x["created_at"], reverse=True)]


@app.get("/api/artifacts")
async def list_artifacts():
    rows = []
    for t in sorted(orc.T.values(), key=lambda x: x["created_at"], reverse=True):
        for otype, a in t["artifacts"].items():
            ver = a.get("verification") or {}
            rows.append({"transformation_id": t["id"], "transformation_title": t["title"], "type": otype, "label": a["label"],
                         "status": a["status"], "version": a["version"], "approval": a["approval"]["status"],
                         "approved_by": a["approval"]["by"], "counts": ver.get("counts"), "output_hash": a["output_hash"],
                         "updated_at": a["versions"][-1]["created_at"] if a["versions"] else t["created_at"],
                         "exposure": (a.get("security") or {}).get("exposure_label")})
    return rows


@app.get("/api/transformations/{tid}")
async def get_transformation(tid: str):
    return orc.serialize(_t(tid))


@app.delete("/api/transformations/{tid}")
async def delete_transformation(tid: str):
    t = _t(tid)
    _idle(t)
    orc.delete(tid)
    ledger.audit("Transformation deleted", tid, actor=settings.operator(), actor_type="user", transformation_id=tid,
                 status="warning")
    return {"deleted": tid}


@app.post("/api/transformations/{tid}/retry")
async def retry(tid: str):
    t = _t(tid)
    _idle(t)
    if t["status"] != "failed":
        raise HTTPException(409, "Only failed transformations can be retried.")
    orc.reset_for_retry(t)
    orc.spawn(orc.run(tid))
    return orc.serialize(t)


class Message(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.post("/api/transformations/{tid}/messages")
async def post_message(tid: str, body: Message):
    t = _t(tid)
    _idle(t)
    orc.spawn(orc.handle_message(t, body.text.strip()))
    return {"accepted": True}


class Contract(BaseModel):
    params: dict


@app.put("/api/transformations/{tid}/contract")
async def put_contract(tid: str, body: Contract):
    t = _t(tid)
    _idle(t)
    p = normalise_params({**t["params"], **body.params})
    if all(p.get(k) == t["params"].get(k) for k in p):
        raise HTTPException(400, "No contract changes to apply.")
    orc.spawn(orc.apply_contract(t, p))
    return {"accepted": True}


class ClaimUpdate(BaseModel):
    value: str | None = None
    modality: str | None = None
    note: str = ""


@app.patch("/api/transformations/{tid}/claims/{cid}")
async def patch_claim(tid: str, cid: str, body: ClaimUpdate):
    t = _t(tid)
    _idle(t)
    if not any(c["claim_id"] == cid for c in t["claims"]):
        raise HTTPException(404, "Claim not found")
    res = orc.update_claim(t, cid, body.value, body.modality, body.note.strip()[:300])
    return {"dependents": res["dependents"], "transformation": orc.serialize(t)}


@app.post("/api/transformations/{tid}/regenerate-stale")
async def regenerate_stale(tid: str):
    """Dependency-aware regeneration: only artefacts whose evidence changed."""
    t = _t(tid)
    _idle(t)
    stale = {o: a["stale"] for o, a in t["artifacts"].items() if a.get("stale")}
    if not stale:
        raise HTTPException(400, "No artefacts depend on changed evidence.")

    async def go():
        repair = {o: s for o, s in stale.items() if s.get("old_surfaces")}
        regen = [o for o in stale if o not in repair]
        groups: dict[tuple, list[str]] = {}
        for o, s in repair.items():
            groups.setdefault((tuple(s["old_surfaces"]), s["new_value"], s["reason"]), []).append(o)
        for (old, new, reason), outs in groups.items():
            await orc.regenerate(t, outs, "", reason, {"old": list(old), "new": new})
        if regen:
            instr = "Evidence was updated by a human reviewer: " + "; ".join(stale[o]["reason"] for o in regen) + \
                    ". Use the updated ledger values exactly."
            await orc.regenerate(t, regen, instr, "Evidence update")
    ledger.audit("Dependent regeneration started", tid, actor=settings.operator(), actor_type="user", transformation_id=tid,
                 detail=f"{len(stale)} of {len(t['artifacts'])} artefacts: {', '.join(stale)}")
    orc.spawn(go())
    return {"accepted": True, "artifacts": list(stale)}


class Resolve(BaseModel):
    claim_id: str
    note: str = ""


@app.post("/api/transformations/{tid}/source-conflicts/{scid}/resolve")
async def resolve_conflict(tid: str, scid: str, body: Resolve):
    t = _t(tid)
    _idle(t)
    if not any(c["id"] == scid for c in t["source_conflicts"]):
        raise HTTPException(404, "Conflict not found")
    try:
        deps = orc.resolve_source_conflict(t, scid, body.claim_id, body.note.strip()[:300])
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"dependents": deps, "transformation": orc.serialize(t)}


@app.post("/api/transformations/{tid}/consistency/{cxid}/repair")
async def repair_conflict(tid: str, cxid: str):
    t = _t(tid)
    _idle(t)
    cx = next((c for c in t["consistency"]["conflicts"] if c["id"] == cxid), None)
    if not cx:
        raise HTTPException(404, "Conflict not found or already repaired")
    wrong = sorted({o["value"] for o in cx["observations"] if not o["matches"]})
    ledger.audit("Conflict repair started", cxid, actor=settings.operator(), actor_type="user", transformation_id=tid,
                 detail=f"{cx['attribute']}: {', '.join(wrong)} → {cx['source_value']} in {', '.join(cx['affected'])}")
    orc.spawn(orc.regenerate(t, cx["affected"], "", f"Repair {cx['claim_id']}: restore {cx['source_value']}",
                             {"old": wrong, "new": cx["source_value"]}))
    return {"accepted": True, "artifacts": cx["affected"]}


class Instruction(BaseModel):
    instruction: str = ""


@app.post("/api/transformations/{tid}/artifacts/{otype}/regenerate")
async def regenerate(tid: str, otype: str, body: Instruction):
    t = _t(tid)
    _art(t, otype)
    _idle(t)
    instr = body.instruction.strip()[:1000]
    orc.spawn(orc.regenerate(t, [otype], instr, f"Regenerate: {instr[:120]}" if instr else "Regenerate"))
    return {"accepted": True}


@app.post("/api/transformations/{tid}/artifacts/{otype}/repair-uncertainty")
async def repair_uncertainty(tid: str, otype: str):
    t = _t(tid)
    a = _art(t, otype)
    _idle(t)
    issues = [i for r in (a.get("verification") or {}).get("refs", []) for i in r["issues"] if i["kind"] == "uncertainty"]
    if not issues:
        raise HTTPException(400, "No uncertainty violations to repair.")
    claims = {c["claim_id"]: c for c in t["claims"]}
    instr = "Preserve source certainty. " + " ".join(
        f"{i['claim_id']} is '{i['expected']}' in the source (\"{claims[i['claim_id']]['evidence_text'][:160]}\"); "
        f"keep hedged wording and never state it as confirmed." for i in issues)
    orc.spawn(orc.regenerate(t, [otype], instr, "Repair uncertainty strengthening"))
    return {"accepted": True}


class Edit(BaseModel):
    content: dict
    note: str = ""


@app.put("/api/transformations/{tid}/artifacts/{otype}")
async def edit_artifact(tid: str, otype: str, body: Edit):
    t = _t(tid)
    a = _art(t, otype)
    _idle(t)
    if a["content"] is None:
        raise HTTPException(409, "Nothing to edit yet.")
    from .schema_tools import coerce
    content = coerce(OUTPUT_TYPES[otype]["schema"], body.content)
    orc.edit_artifact(t, otype, content, body.note.strip()[:200])
    orc._reverify_all(t)
    await orc._finalise(t, "Manual edit")
    return orc.serialize(t)


@app.post("/api/transformations/{tid}/artifacts/{otype}/simulate-drift")
async def simulate_drift(tid: str, otype: str):
    t = _t(tid)
    _art(t, otype)
    _idle(t)
    try:
        change = orc.simulate_drift(t, otype)
    except ValueError as e:
        raise HTTPException(400, str(e))
    orc._reverify_all(t)
    await orc._finalise(t, "Test drift")
    return {"change": change, "transformation": orc.serialize(t)}


class Decision(BaseModel):
    decision: str = Field(pattern="^(approve|reject|request_changes)$")
    comment: str = ""


@app.post("/api/transformations/{tid}/artifacts/{otype}/approval")
async def approval(tid: str, otype: str, body: Decision):
    t = _t(tid)
    a = _art(t, otype)
    _idle(t)
    if a["content"] is None:
        raise HTTPException(409, "This artefact has not been generated.")
    try:
        orc.approve(t, otype, body.decision, body.comment.strip()[:500])
    except PermissionError as e:
        raise HTTPException(409, str(e))
    if body.decision == "request_changes" and body.comment.strip():
        orc.spawn(orc.regenerate(t, [otype], body.comment.strip(), f"Changes requested: {body.comment.strip()[:120]}"))
    return orc.serialize(t)


@app.post("/api/transformations/{tid}/artifacts/{otype}/illustrations")
async def illustrate(tid: str, otype: str):
    t = _t(tid)
    a = _art(t, otype)
    _idle(t)
    if not imagegen.available():
        raise HTTPException(409, "Image generation is not configured on this server.")
    if not a["content"]:
        raise HTTPException(409, "Generate the artefact first.")
    if not imagegen.slots(otype, a["content"]):
        raise HTTPException(400, f"{a['label']} has no visual suggestions to illustrate.")
    orc.spawn(orc.illustrate(t, otype))
    return {"accepted": True}


@app.get("/api/transformations/{tid}/artifacts/{otype}/illustrations/{slot}.jpg")
async def illustration(tid: str, otype: str, slot: str):
    _art(_t(tid), otype)
    if not re.fullmatch(r"[a-z]+-?\d*", slot):
        raise HTTPException(404, "Not found")
    p = orc.illustration_path(tid, otype, slot)
    if not p.exists():
        raise HTTPException(404, "Illustration not found")
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@app.get("/api/transformations/{tid}/artifacts/{otype}/versions/{version}")
async def artifact_version(tid: str, otype: str, version: int):
    a = _art(_t(tid), otype)
    v = next((x for x in a["versions"] if x["version"] == version), None)
    if not v:
        raise HTTPException(404, "Version not found")
    return v


def _image_files(tid: str, otype: str) -> dict[str, bytes]:
    a = orc.T[tid]["artifacts"][otype]
    out = {}
    for ill in a.get("illustrations", []):
        p = orc.illustration_path(tid, otype, ill["slot"])
        if p.exists():
            out[ill["slot"]] = p.read_bytes()
    return out


def _slide_images(tid: str, otype: str) -> dict[int, bytes]:
    if otype != "presentation":
        return {}
    return {int(k.split("-")[1]): v for k, v in _image_files(tid, otype).items() if k.startswith("slide-")}


def _footer(t: dict, a: dict) -> str:
    appr = a["approval"]
    return (f"PRAMAAN provenance · {t['id']} · {a['label']} v{a['version']} · output sha256 {a['output_hash']} · "
            f"evidence {t['provenance']['evidence_hash'][:16]} · approved by {appr['by']} at {appr['at']}")


@app.get("/api/transformations/{tid}/artifacts/{otype}/preview.svg")
async def preview_svg(tid: str, otype: str, released: bool = True):
    a = _art(_t(tid), otype)
    if otype != "infographic" or not a["content"]:
        raise HTTPException(404, "No infographic preview")
    return Response(exporters.to_svg(a["released"] if released else a["content"]), media_type="image/svg+xml",
                    headers={"Cache-Control": "no-store"})


@app.get("/api/transformations/{tid}/artifacts/{otype}/export.{fmt}")
async def export(tid: str, otype: str, fmt: str):
    t = _t(tid)
    a = _art(t, otype)
    if a["approval"]["status"] != "approved":
        raise HTTPException(403, "Export requires human approval of the current version.")
    try:
        body = exporters.render(otype, fmt, a["released"], _footer(t, a), _slide_images(tid, otype))
    except ValueError as e:
        raise HTTPException(400, str(e))
    orc.record_export(t, otype, fmt)
    return Response(body, media_type=exporters.MIME[fmt],
                    headers={"Content-Disposition": f'attachment; filename="{exporters.filename(t, otype, fmt)}"'})


@app.get("/api/transformations/{tid}/bundle.zip")
async def export_bundle(tid: str):
    t = _t(tid)
    if not any(a["approval"]["status"] == "approved" for a in t["artifacts"].values()):
        raise HTTPException(403, "Approve at least one artefact before exporting a bundle.")
    data = exporters.bundle(t, lambda a: _footer(t, a), lambda o: _image_files(tid, o))
    ledger.audit("Bundle exported", tid, actor=settings.operator(), actor_type="user", transformation_id=tid)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{tid}-approved-bundle.zip"'})


@app.get("/api/transformations/{tid}/sources/{sid}/pages/{page}.png")
async def page_image(tid: str, sid: str, page: int):
    _t(tid)
    src = next((s for s in orc.SOURCES.get(tid, []) if s.id == sid), None)
    if not src or not src.pdf:
        raise HTTPException(404, "No page image for this source")
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(src.pdf)
    if not 1 <= page <= len(pdf):
        raise HTTPException(404, "Page out of range")
    img = pdf[page - 1].render(scale=1.6).to_pil()
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/transformations/{tid}/sources/{sid}/text")
async def source_text(tid: str, sid: str, start: int = 0, end: int | None = None):
    _t(tid)
    src = next((s for s in orc.SOURCES.get(tid, []) if s.id == sid), None)
    if not src:
        raise HTTPException(404, "Source not found")
    end = min(end if end is not None else len(src.text), len(src.text))
    start = max(0, min(start, end))
    return {"id": sid, "name": src.name, "start": start, "end": end, "text": src.text[start:end], "length": len(src.text)}


# ---------------------------------------------------------------------------
# Audit, ledger, notifications
# ---------------------------------------------------------------------------
@app.get("/api/audit")
async def audit(page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=200), transformation_id: str = "",
                q: str = "", status: str = "", actor_type: str = ""):
    rows = list(reversed(ledger.AUDIT))
    if transformation_id:
        rows = [r for r in rows if r["transformation_id"] == transformation_id]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if actor_type:
        rows = [r for r in rows if r["actor_type"] == actor_type]
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in " ".join(str(r.get(k, "")) for k in ("action", "object", "actor", "detail", "transformation_id")).lower()]
    total = len(rows)
    return {"total": total, "page": page, "size": size, "items": rows[(page - 1) * size: page * size]}


@app.get("/api/ledger")
async def get_ledger(transformation_id: str = "", limit: int = Query(100, ge=1, le=500)):
    rows = [e for e in ledger.LEDGER if not transformation_id or e["transformation_id"] == transformation_id]
    return {"verification": ledger.verify_chain(), "entries": list(reversed(rows))[:limit],
            "note": "Local hash-chained ledger. Stores hashes and metadata only, never source content. "
                    "No external blockchain anchoring is configured."}


@app.get("/api/notifications")
async def notifications():
    st = settings.get()
    keep = []
    for e in reversed(ledger.AUDIT):
        a = e["action"].lower()
        if e["status"] == "failed" and st["notify_on_failure"]:
            keep.append({**e, "kind": "failure"})
        elif ("injection" in a or "security" in a or "blocked" in a) and e["status"] == "warning" and st["notify_on_security"]:
            keep.append({**e, "kind": "security"})
        elif e["status"] == "warning" and st["notify_on_review"]:
            keep.append({**e, "kind": "review"})
        elif a in ("human approval recorded",) or a.endswith("verification passed"):
            keep.append({**e, "kind": "info"})
        if len(keep) >= 30:
            break
    return keep


@app.exception_handler(Exception)
async def _unhandled(_, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse({"detail": f"Internal error: {type(exc).__name__}"}, status_code=500)


# ---------------------------------------------------------------------------
# Web app (Vite build in web/dist); client-side routes fall back to index.html
# ---------------------------------------------------------------------------
if (config.WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=config.WEB_DIST / "assets"), name="assets")

_RESERVED = re.compile(r"^(api|docs|redoc|openapi\.json|healthz|assets)(/|$)")


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str):
    if _RESERVED.match(path):
        raise HTTPException(404, "Not found")
    f = config.WEB_DIST / path
    if path and f.is_file() and config.WEB_DIST in f.resolve().parents:
        return FileResponse(f)
    index = config.WEB_DIST / "index.html"
    if not index.exists():
        return JSONResponse({"detail": "Web app not built. Run: cd web && npm install && npm run build"}, status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
