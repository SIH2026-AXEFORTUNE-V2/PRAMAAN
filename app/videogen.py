"""Video Production: turns a verified Video Package into one narrated, subtitled MP4.

Per scene:
  visual     a real motion clip from Amazon Nova Reel (via Pollinations, when POLLINATIONS_API_KEY is set);
             otherwise, or if the clip fails, a slow pan-and-zoom over the scene's FLUX still
  narration  Cloudflare Workers AI Deepgram Aura-2, reading the RELEASED scene script (security policy applied)
  subtitles  caption cards drawn with Pillow (no system fonts needed) and timed to the real audio length
Scenes are encoded to identical segments and concatenated with the ffmpeg bundled in imageio-ffmpeg.
A persistent "AI-generated video" mark is burned into every frame.
"""
from __future__ import annotations

import asyncio
import re
import subprocess
import textwrap
import urllib.parse
from pathlib import Path

import httpx

from . import config
from .hf_engine import EngineError

W, H, FPS = 960, 540, 25
PAD = 0.7  # seconds of breathing room after each scene's narration


def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def tts_available() -> bool:
    return bool(config.CLOUDFLARE_ACCOUNT_ID and config.CLOUDFLARE_API_TOKEN)


def motion_available() -> bool:
    return bool(config.POLLINATIONS_API_KEY)


def speakable(text: str) -> str:
    """Released text may contain policy markers; say them naturally instead of reading brackets."""
    text = re.sub(r"\[\.\]", " dot ", text or "")          # defanged indicators, e.g. heron-update[.]example
    text = re.sub(r"\b(\d{1,3}\.\d{1,3})\.x\.x\b", r"\1 dot x dot x", text)
    text = re.sub(r"\[REDACTED:[^\]]*\]", "withheld", text)
    text = re.sub(r"\[(?:internal system|restricted)\]", "an internal system", text)
    text = re.sub(r"\[facility location withheld\]", "a secure facility", text)
    text = re.sub(r"\[[^\]]{1,60}\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


async def narrate(text: str) -> bytes:
    url = f"https://api.cloudflare.com/client/v4/accounts/{config.CLOUDFLARE_ACCOUNT_ID}/ai/run/{config.TTS_MODEL}"
    body: dict = {"text": text}
    if config.TTS_VOICE:
        body["speaker"] = config.TTS_VOICE
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(3):
            r = await client.post(url, json=body, headers={"Authorization": f"Bearer {config.CLOUDFLARE_API_TOKEN}"})
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("audio/"):
                return r.content
            if r.status_code in (401, 403):
                raise EngineError("Cloudflare rejected the token for text-to-speech.")
            if quota_exhausted(r):
                raise EngineError(QUOTA_MSG)
            await asyncio.sleep(2 * (attempt + 1))
    raise EngineError(f"Narration failed: HTTP {r.status_code} {r.text[:120]}")


QUOTA_MSG = "Cloudflare Workers AI daily free allowance is used up (resets 00:00 UTC)"


def quota_exhausted(r: httpx.Response) -> bool:
    return r.status_code == 429 and "daily free allocation" in r.text


def silence(seconds: float, path: Path) -> None:
    """Silent narration track, used when text-to-speech is unavailable, so the video still renders."""
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
           "-t", f"{seconds:.2f}", "-c:a", "libmp3lame", "-b:a", "64k", str(path)]
    subprocess.run(cmd, check=True, capture_output=True)


def reading_seconds(text: str) -> float:
    return max(3.0, len(text.split()) / 2.4)  # comfortable subtitle reading pace


async def motion_clip(prompt: str) -> tuple[bytes | None, str | None]:
    """One motion clip via Pollinations. Returns (clip, None) or (None, reason) so the scene can fall back to a still."""
    if not motion_available():
        return None, "no motion model configured"
    url = f"https://gen.pollinations.ai/image/{urllib.parse.quote(prompt[:400])}"
    params = {"model": config.VIDEO_MODEL, "duration": str(config.VIDEO_CLIP_SECONDS), "nologo": "true"}
    try:
        async with httpx.AsyncClient(timeout=config.VIDEO_TIMEOUT_S) as client:
            r = await client.get(url, params=params, headers={"Authorization": f"Bearer {config.POLLINATIONS_API_KEY}"})
    except httpx.HTTPError as e:
        return None, f"motion request failed ({type(e).__name__})"
    if r.status_code == 200 and r.headers.get("content-type", "").startswith("video/") and len(r.content) > 10_000:
        return r.content, None
    try:
        msg = r.json().get("error", {}).get("message", "")
    except ValueError:
        msg = r.text[:160]
    if r.status_code == 402:
        return None, "insufficient Pollinations balance: " + msg.split(". Top up")[0]
    return None, f"HTTP {r.status_code}: {msg[:160]}"


def duration(path: Path) -> float:
    out = subprocess.run([_ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0


def _font(size: int):
    from PIL import ImageFont
    return ImageFont.load_default(size=size)


def caption_card(text: str, path: Path) -> None:
    """Full-frame transparent PNG with a subtitle box at the bottom."""
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = _font(26)
    lines = textwrap.wrap(text, 58)[:2]
    lh = 34
    box_h = lh * len(lines) + 20
    widths = [d.textlength(ln, font=font) for ln in lines]
    bw = int(max(widths)) + 36
    x0, y0 = (W - bw) // 2, H - box_h - 28
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + box_h), radius=8, fill=(10, 16, 30, 190))
    for i, ln in enumerate(lines):
        d.text(((W - widths[i]) / 2, y0 + 10 + i * lh), ln, font=font, fill=(255, 255, 255, 255))
    img.save(path)


def watermark(path: Path) -> None:
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = _font(16)
    label = "AI-generated video · PRAMAAN"
    tw = d.textlength(label, font=font)
    d.rounded_rectangle((16, 14, 16 + tw + 20, 42), radius=6, fill=(10, 16, 30, 150))
    d.text((26, 19), label, font=font, fill=(255, 255, 255, 230))
    img.save(path)


def title_still(text: str, path: Path) -> None:
    """Last-resort visual when no image model is available: an ink card with the scene title."""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W * 2, H * 2), (23, 32, 51))
    d = ImageDraw.Draw(img)
    font = _font(64)
    for i, ln in enumerate(textwrap.wrap(text, 28)[:3]):
        d.text((120, 380 + i * 84), ln, font=font, fill=(230, 234, 242))
    d.rectangle((120, 330, 220, 338), fill=(242, 210, 75))
    img.save(path, quality=90)


def chunks(narration: str, total: float) -> list[tuple[str, float, float]]:
    """Split narration into caption chunks timed by word share of the real audio length."""
    words = narration.split()
    if not words:
        return []
    groups, cur = [], []
    for w in words:
        cur.append(w)
        if len(" ".join(cur)) > 80 or (w.endswith((".", "?", "!")) and len(" ".join(cur)) > 36):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    out, t = [], 0.0
    for g in groups:
        dur = total * len(g) / len(words)
        out.append((" ".join(g), t, t + dur))
        t += dur
    return out


def render_segment(work: Path, idx: int, visual: Path, is_clip: bool, audio: Path, narration: str) -> tuple[Path, float, list]:
    speech = duration(audio)
    seg_len = max(speech + PAD, 3.5)
    frames = int(seg_len * FPS) + 1
    caps = chunks(narration, speech)
    stretch = 1.0
    if is_clip:
        clip_len = duration(visual) or float(config.VIDEO_CLIP_SECONDS)
        stretch = seg_len / clip_len
    looped = is_clip and stretch > 2.5  # slow the clip down to fit the narration; loop only if that would look unnatural
    inputs = ["-i", str(visual)] if not looped else ["-stream_loop", "-1", "-i", str(visual)]
    inputs += ["-i", str(audio), "-i", str(work / "watermark.png")]
    fc = []
    if is_clip:
        speed = "" if looped or stretch <= 1 else f"setpts={stretch:.3f}*PTS,"
        fc.append(f"[0:v]{speed}scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},format=yuv420p[base]")
    else:
        zoom_step = round(0.10 / frames, 6)
        fc.append(f"[0:v]scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
                  f"zoompan=z='min(zoom+{zoom_step},1.10)':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                  f":s={W}x{H}:fps={FPS},format=yuv420p[base]")
    fc.append("[base][2:v]overlay=0:0[v0]")
    last = "v0"
    for i, (text, a, b) in enumerate(caps):
        png = work / f"cap-{idx}-{i}.png"
        caption_card(text, png)
        inputs += ["-i", str(png)]
        fc.append(f"[{last}][{3 + i}:v]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[v{i + 1}]")
        last = f"v{i + 1}"
    out = work / f"seg-{idx:02d}.mp4"
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(fc),
           "-map", f"[{last}]", "-map", "1:a", "-af", "apad", "-t", f"{seg_len:.2f}",
           "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-r", str(FPS), "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "2", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise EngineError(f"Encoding scene {idx} failed: {res.stderr.strip()[-300:]}")
    return out, seg_len, caps


def tc(sec: float) -> str:
    m, s = divmod(max(sec, 0.0), 60)
    return f"{int(m):02d}:{s:04.1f}"


def production_script(title: str, tid: str, render: dict) -> str:
    """Markdown production script of what was actually rendered: timecodes, spoken lines, subtitles, visuals."""
    out = [f"# Production script · {title}", "",
           f"Transformation {tid} · Video Package v{render['artifact_version']} · {render['seconds']:.0f} s · {render['resolution']}",
           f"Renderer: {'JSON2Video (cloud)' if render.get('renderer') == 'json2video' else 'local ffmpeg'}"
           + (" · timecodes estimated from spoken words" if render.get("timing") == "estimated" else ""),
           *( [f"Cloud renderer skipped: {render['cloud_note']}"] if render.get("cloud_note") else [] ),
           f"Narration: {render['models']['narration']} · Motion: {render['models']['motion'] or 'not configured (animated stills)'}"
           f" · Stills: {render['models']['stills'] or '—'}",
           *( [f"Narration note: {render['narration_note']}"] if render.get("narration_note") else [] ),
           *( [f"Motion note: {render['motion_note']}"] if render.get("motion_note") and render["models"].get("motion") else [] ),
           f"Video sha256: {render['sha256']}", "",
           "Narration is the verified, released script; visuals are AI-generated illustrations, not evidence.", ""]
    for s in render["scenes"]:
        approx = "≈" if render.get("timing") == "estimated" else ""
        out += [f"## Scene {s['scene']} · {approx}{tc(s.get('start', 0))}–{approx}{tc(s.get('end', 0))} · {s['title']}", "",
                f"**Visual** ({'motion clip' if s['source'] == 'motion' else s['source']}): {s['prompt']}", "",
                f"**Narration (spoken):** {s.get('spoken', '')}", ""]
        if s.get("captions"):
            out.append("**Subtitles:**")
            out += [f"- {tc(s['start'] + c[1])}–{tc(s['start'] + c[2])}  {c[0]}" for c in s["captions"]]
            out.append("")
    return "\n".join(out)


def stitch(work: Path, segments: list[Path], out: Path) -> float:
    lst = work / "segments.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in segments))
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
           "-c", "copy", "-movflags", "+faststart", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=work)
    if res.returncode != 0:
        raise EngineError(f"Joining scenes failed: {res.stderr.strip()[-300:]}")
    return duration(out)


# ---------------------------------------------------------------------------
# JSON2Video (cloud renderer): AI images, Azure neural voices and subtitles rendered on their servers.
# ---------------------------------------------------------------------------
J2V_API = "https://api.json2video.com/v2/movies"
AZURE_VOICES = {
    "English": ("en-US-AriaNeural", "en"), "Hindi": ("hi-IN-SwaraNeural", "hi"), "Tamil": ("ta-IN-PallaviNeural", "ta"),
    "Telugu": ("te-IN-ShrutiNeural", "te"), "Kannada": ("kn-IN-SapnaNeural", "kn"), "Malayalam": ("ml-IN-SobhanaNeural", "ml"),
    "Marathi": ("mr-IN-AarohiNeural", "mr"), "Bengali": ("bn-IN-TanishaaNeural", "bn"), "Gujarati": ("gu-IN-DhwaniNeural", "gu"),
    "French": ("fr-FR-DeniseNeural", "fr"), "Spanish": ("es-ES-ElviraNeural", "es"), "Arabic": ("ar-SA-ZariyahNeural", "ar"),
}


def j2v_available() -> bool:
    return bool(config.JSON2VIDEO_API_KEY)


def j2v_estimate(spoken: list[str]) -> float:
    """Rough spoken length: ~2.5 words/s plus a short pause per scene."""
    return sum(max(2.5, len(s.split()) / 2.5) + 0.4 for s in spoken)


def j2v_movie(scenes: list[dict], language: str) -> dict:
    voice, lang = AZURE_VOICES.get(language, AZURE_VOICES["English"])
    if config.J2V_VOICE and language == "English":
        voice = config.J2V_VOICE
    return {
        "resolution": "custom", "width": 1280, "height": 720, "quality": "high",
        "scenes": [{"elements": [
            {"type": "image", "prompt": s["prompt"][:900], "model": config.J2V_IMAGE_MODEL, "zoom": 2 if i % 2 == 0 else -2},
            {"type": "voice", "text": s["spoken"], "model": "azure", "voice": voice},
        ]} for i, s in enumerate(scenes)],
        "elements": [
            {"type": "subtitles", "language": lang,
             "settings": {"style": "classic", "font-family": "Atkinson Hyperlegible", "position": "bottom-center"}},
            {"type": "text", "style": "001", "text": "AI-generated video · PRAMAAN", "duration": -2,
             "settings": {"vertical-position": "top", "horizontal-position": "left", "font-family": "Atkinson Hyperlegible",
                          "font-size": "22px", "color": "#FFFFFF", "background-color": "rgba(10,16,30,0.55)",
                          "padding": "6px 12px", "margin": "22px", "border-radius": "6px"}},
        ],
    }


async def render_json2video(scenes: list[dict], language: str, out: Path, progress=None) -> dict:
    """Render on JSON2Video and download the MP4 to `out`. Raises EngineError (caller falls back to local)."""
    headers = {"x-api-key": config.JSON2VIDEO_API_KEY, "Content-Type": "application/json"}
    need = j2v_estimate([s["spoken"] for s in scenes])
    async with httpx.AsyncClient(timeout=60) as client:
        acct = (await client.get("https://api.json2video.com/v2/account", headers=headers)).json()
        max_len = (acct.get("account", {}).get("plan_info") or {}).get("max_length") or 600
        quota = ((await client.get(J2V_API, headers=headers)).json().get("remaining_quota") or {}).get("time", 0)
        if need > max_len - 2:
            raise EngineError(f"narration runs ~{need:.0f}s, over JSON2Video's {max_len}s plan limit (narration is never cut)")
        if quota < need + 5:
            raise EngineError(f"JSON2Video quota has {quota:.0f}s left, this video needs ~{need:.0f}s")
        r = await client.post(J2V_API, headers=headers, json=j2v_movie(scenes, language))
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if not body.get("success"):
            raise EngineError(f"JSON2Video rejected the movie: {str(body.get('message') or r.text)[:200]}")
        project = body["project"]
        movie: dict = {}
        for _ in range(config.J2V_TIMEOUT_S // 5):
            await asyncio.sleep(5)
            movie = (await client.get(J2V_API, params={"project": project}, headers=headers)).json().get("movie", {})
            if progress:
                progress(movie.get("message") or movie.get("status") or "rendering")
            if movie.get("status") in ("done", "error"):
                break
        if movie.get("status") != "done" or not movie.get("url"):
            raise EngineError(f"JSON2Video render {movie.get('status') or 'timed out'}: {movie.get('message', '')[:160]}")
        async with client.stream("GET", movie["url"], timeout=120) as resp:
            if resp.status_code != 200:
                raise EngineError(f"Could not download the rendered video (HTTP {resp.status_code}).")
            with out.open("wb") as fh:
                async for chunk in resp.aiter_bytes():
                    fh.write(chunk)
        quota_left = ((await client.get(J2V_API, headers=headers)).json().get("remaining_quota") or {}).get("time")
    return {"project": project, "voice": j2v_movie(scenes[:1], language)["scenes"][0]["elements"][1]["voice"],
            "rendering_time": movie.get("rendering_time"), "quota_left": quota_left, "resolution": f"{movie.get('width')}x{movie.get('height')}"}
