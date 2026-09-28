"""Visual Agent: illustrative images for artefacts via OpenAI gpt-image (when OPENAI_API_KEY is set)
or Cloudflare Workers AI (FLUX.1 [schnell]); Cloudflare is also the fallback when OpenAI fails.

Illustrations are decoration, never evidence. To keep them from carrying factual claims:
  * prompts come only from the writer's visual suggestions, not from claims or the source;
  * every sensitive finding (PII, hosts, IPs, credentials, markings, locations) is removed first;
  * digits are stripped, so no dates, figures or indicators are drawn into the image;
  * the model is told to render no text, numbers, logos, flags or identifiable faces.
Each image is labelled "AI-generated illustration" in the UI and recorded (with its hash and the
exact prompt sent) in the provenance ledger.
"""
from __future__ import annotations

import base64
import io
import re

import httpx

from . import config
from .hf_engine import EngineError
from .security import scan_text

# Photographic scenes: image models rarely invent typography for them (unlike "illustration"/"infographic").
STYLE = ("cinematic photograph, minimal composition, deep ink-blue and slate tones with one warm amber highlight, "
         "soft directional light, shallow depth of field")
GUARD = "no text, no lettering, no signage, no screens showing text, no logos, no flags, no maps, no identifiable faces"

ART_DIRECTOR = """You are an art director choosing a photograph to accompany one part of a professional briefing.
Describe ONE concrete, photographable scene made of physical objects, places and light that evokes the topic
metaphorically. Rules: no people's faces, no text, no documents, no screens, no charts, no signs, no logos,
no numbers, no real organisation or person names. 12-28 words, present tense, no preamble."""
SCENE_SCHEMA = {"type": "object", "properties": {"scene": {"type": "string", "description": "The scene, 12-28 words."}},
                "required": ["scene"]}
# Words that make image models draw typography or UI. Graphics like these belong in the infographic, not here.
TEXTY = re.compile(r"\b(?:company\s+)?(?:logos?|icons?(?:\s+set)?|diagrams?|charts?|graphs?|timelines?|infographics?|"
                   r"texts?|titles?|labels?|captions?|bullet(?:\s+points?)?|slides?|screenshots?|dashboards?|ui|data\s+tables?|"
                   r"split[- ]screen|headlines?|words?|typography|lower[- ]thirds?|overlays?|graphics?|numbers?|"
                   r"statistics?|stats?|callouts?|badges?|banners?)\b", re.I)

# (slot, label, aspect ratio w/h) chosen per artefact type from fields the writer already produced.
ASPECT = {"linkedin": 1.91, "presentation": 16 / 9, "cover": 6.0 / 7.5, "video": 16 / 9}


def cloudflare_available() -> bool:
    return bool(config.CLOUDFLARE_ACCOUNT_ID and config.CLOUDFLARE_API_TOKEN)


def available() -> bool:
    return bool(config.OPENAI_API_KEY) or cloudflare_available()


def model_name() -> str:
    return config.OPENAI_IMAGE_MODEL if config.OPENAI_API_KEY else config.IMAGE_MODEL


def openai_size(aspect: float) -> str:
    """gpt-image renders three fixed sizes; pick the nearest and crop to the exact aspect afterwards."""
    return "1536x1024" if aspect > 1.2 else ("1024x1536" if aspect < 0.83 else "1024x1024")


async def openai_image(prompt: str, size: str, model: str, quality: str, timeout: float = 180) -> bytes:
    body = {"model": model, "prompt": prompt, "size": size, "quality": quality, "output_format": "jpeg", "n": 1}
    headers = {"Authorization": f"Bearer {config.OPENAI_API_KEY}"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(3):
            try:
                r = await client.post(f"{config.OPENAI_BASE_URL.rstrip('/')}/images/generations", json=body, headers=headers)
            except httpx.HTTPError as e:
                if attempt == 2:
                    raise EngineError(f"Image generation failed: {e}") from e
                continue
            if r.status_code == 200:
                raw = base64.b64decode(r.json()["data"][0].get("b64_json") or "")
                if not raw:
                    raise EngineError("The image model returned no image.")
                return raw
            err = (r.json().get("error") or {}) if r.headers.get("content-type", "").startswith("application/json") else {}
            if r.status_code in (401, 403):
                raise EngineError(f"OpenAI refused image generation: {(err.get('message') or r.text)[:160]}")
            if err.get("code") == "insufficient_quota":
                raise EngineError("The OpenAI account has no remaining quota for image generation.")
            if err.get("code") == "moderation_blocked":
                raise EngineError("OpenAI's safety system declined this image prompt.")
            if r.status_code == 429 or r.status_code >= 500:
                import asyncio
                await asyncio.sleep(3 * (attempt + 1))
                continue
            raise EngineError(f"Image generation failed: HTTP {r.status_code} {(err.get('message') or r.text)[:160]}")
    raise EngineError("Image generation is rate-limited right now; try again in a minute.")


def slots(otype: str, content: dict, domain: str = "") -> list[dict]:
    """Which images an artefact gets. Each brief = the topic of that part + the writer's visual suggestion."""
    out: list[dict] = []
    topic = domain or "an organisational briefing"
    if otype == "linkedin" and (content.get("suggested_visual") or content.get("hook")):
        out.append({"slot": "post", "label": "Post image", "topic": f"{topic}: {content.get('hook', '')}",
                    "brief": content.get("suggested_visual", ""), "aspect": ASPECT["linkedin"]})
    elif otype == "presentation":
        slides = content.get("slides", [])
        if slides:
            out.append({"slot": "slide-1", "label": "Cover", "topic": f"{topic}: {content.get('title', '')}",
                        "brief": slides[0].get("visual_suggestion", ""), "aspect": ASPECT["cover"]})
        # only slides whose layout has room for an image (bullets: right-hand panel)
        picked = [(i, s) for i, s in enumerate(slides[1:], 2) if s.get("layout") == "bullets"][:2]
        out += [{"slot": f"slide-{i}", "label": f"Slide {i}", "topic": f"{topic}: {s.get('title', '')}",
                 "brief": s.get("visual_suggestion", ""), "aspect": ASPECT["presentation"]} for i, s in picked]
    elif otype == "video":
        for s in content.get("scenes", [])[:4]:
            n = s.get("scene_number")
            out.append({"slot": f"scene-{n}", "label": f"Scene {n}", "topic": f"{topic}: {s.get('title', '')}",
                        "brief": s.get("visual_description", ""), "aspect": ASPECT["video"]})
    return out


def _scrub(text: str, removed: list[str], ignore: frozenset = frozenset()) -> str:
    for f in sorted((f for f in scan_text(text) if f["class"] not in ignore), key=lambda x: -x["span"][0]):
        a, b = f["span"]
        removed.append(f["label"])
        text = text[:a] + " " + text[b:]
    if re.search(r"\d", text):
        removed.append("figures and dates")
        text = re.sub(r"[\d][\d,.:/%-]*", " ", text)
    text = re.sub(r"[\"“”'`]", "", text)
    text = re.sub(r"\b(?:with|on|at|in|from|of|to|and)\s+(?=[,.;:]|\s*$)", "", text)   # dangling words left by removals
    text = re.sub(r"\s*([,.;:])(?:\s*[,.;:])+", r"\1", text)
    return re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s+", " ", text)).strip(" .,;:-")


def art_brief(brief: str, topic: str) -> tuple[str, list[str]]:
    """Scrubbed input for the art director: sensitive findings and figures never leave the server."""
    removed: list[str] = []
    return f"Topic: {_scrub(topic, removed)}\nWriter's visual suggestion: {_scrub(brief, removed)}", sorted(set(removed))


def scene_prompt(scene: str) -> str:
    # Art-director output is generic imagery built from already-scrubbed input, so generic places like
    # "server room" are allowed; identifiers, credentials, PII and markings are still removed.
    cleaned = _scrub(TEXTY.sub(" ", scene or ""), [], ignore=frozenset({"location"}))
    return f"{cleaned[:260]}. {STYLE}. {GUARD}."


def build_prompt(brief: str, topic: str = "") -> tuple[str, list[str]]:
    """Scrub a visual brief: sensitive findings, digits and typography-inducing words removed.

    Returns (prompt, what was removed). The topic anchors the scene so the image stays on subject.
    """
    removed: list[str] = []
    subject = _scrub(topic, removed)
    scene = _scrub(brief or "", removed)
    if TEXTY.search(scene) or TEXTY.search(subject):
        removed.append("typography requests (logos, charts, labels)")
        scene, subject = TEXTY.sub(" ", scene), TEXTY.sub(" ", subject)
        scene, subject = _scrub(scene, []), _scrub(subject, [])
    parts = [f"A wordless conceptual illustration representing {subject[:160]}" if subject else "A wordless conceptual illustration"]
    if len(scene.split()) >= 3:
        parts.append(f"Scene: {scene[:220]}")
    parts.append(f"Style: {STYLE}")
    return ". ".join(parts) + f". {GUARD}.", sorted(set(removed))


def _crop(jpeg: bytes, aspect: float, max_w: int = 1280) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    w, h = img.size
    if w / h > aspect:
        nw = int(h * aspect)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / aspect)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    if img.width > max_w:
        img = img.resize((max_w, int(max_w / aspect)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=84, optimize=True, progressive=True)
    return buf.getvalue()


async def generate(prompt: str, aspect: float) -> bytes:
    if config.OPENAI_API_KEY:
        try:
            return _crop(await openai_image(prompt, openai_size(aspect), config.OPENAI_IMAGE_MODEL, config.OPENAI_IMAGE_QUALITY), aspect)
        except EngineError:
            if not cloudflare_available():
                raise
    if not cloudflare_available():
        raise EngineError("Image generation is not configured (OPENAI_API_KEY, or CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN).")
    url = f"https://api.cloudflare.com/client/v4/accounts/{config.CLOUDFLARE_ACCOUNT_ID}/ai/run/{config.IMAGE_MODEL}"
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(3):
            r = await client.post(url, json={"prompt": prompt, "steps": 4},  # schnell is distilled for 4 steps
                                  headers={"Authorization": f"Bearer {config.CLOUDFLARE_API_TOKEN}"})
            if r.status_code == 200:
                if r.headers.get("content-type", "").startswith("image/"):
                    raw = r.content
                else:
                    raw = base64.b64decode((r.json().get("result") or {}).get("image") or "")
                if not raw:
                    raise EngineError("The image model returned no image.")
                return _crop(raw, aspect)
            if r.status_code in (401, 403):
                raise EngineError("Cloudflare rejected the API token (check CLOUDFLARE_API_TOKEN permissions for Workers AI).")
            if r.status_code == 429 and "daily free allocation" in r.text:
                raise EngineError("Cloudflare Workers AI daily free allowance is used up (resets 00:00 UTC).")
            if r.status_code == 429 or r.status_code >= 500:
                import asyncio
                await asyncio.sleep(2 * (attempt + 1))
                continue
            raise EngineError(f"Image generation failed: HTTP {r.status_code} {r.text[:160]}")
    raise EngineError("Image generation is rate-limited right now; try again in a minute.")
