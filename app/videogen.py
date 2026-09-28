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
    text = re.sub(r"\[REDACTED:[^\]]*\]", "withheld", text or "")
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
            await asyncio.sleep(2 * (attempt + 1))
    raise EngineError(f"Narration failed: HTTP {r.status_code} {r.text[:120]}")


async def motion_clip(prompt: str) -> bytes | None:
    """One Nova Reel clip via Pollinations. Returns None on any failure so the scene falls back to a still."""
    if not motion_available():
        return None
    url = f"https://gen.pollinations.ai/image/{urllib.parse.quote(prompt[:400])}"
    params = {"model": config.VIDEO_MODEL, "duration": "6", "nologo": "true"}
    try:
        async with httpx.AsyncClient(timeout=config.VIDEO_TIMEOUT_S) as client:
            r = await client.get(url, params=params, headers={"Authorization": f"Bearer {config.POLLINATIONS_API_KEY}"})
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("video/") and len(r.content) > 10_000:
            return r.content
    except httpx.HTTPError:
        pass
    return None


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


def render_segment(work: Path, idx: int, visual: Path, is_clip: bool, audio: Path, narration: str) -> Path:
    speech = duration(audio)
    seg_len = max(speech + PAD, 3.5)
    frames = int(seg_len * FPS) + 1
    caps = chunks(narration, speech)
    inputs = ["-i", str(visual)] if not is_clip else ["-stream_loop", "-1", "-i", str(visual)]
    inputs += ["-i", str(audio), "-i", str(work / "watermark.png")]
    fc = []
    if is_clip:
        fc.append(f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},format=yuv420p[base]")
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
    return out


def stitch(work: Path, segments: list[Path], out: Path) -> float:
    lst = work / "segments.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in segments))
    cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
           "-c", "copy", "-movflags", "+faststart", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=work)
    if res.returncode != 0:
        raise EngineError(f"Joining scenes failed: {res.stderr.strip()[-300:]}")
    return duration(out)
