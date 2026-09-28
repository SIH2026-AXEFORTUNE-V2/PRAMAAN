"""Perception stage: converts non-text sources into text for the analysis agent.

- Images             -> vision-language model description + OCR of visible text
- Scanned PDFs       -> first pages rendered to images -> vision model
- Audio              -> Whisper transcript
- Video              -> audio track -> Whisper, plus keyframes -> vision model
FFmpeg comes from the imageio-ffmpeg wheel, so no system install is needed.
"""
from __future__ import annotations

import asyncio
import io
import subprocess
import tempfile
from pathlib import Path

from .ingest import Source

VISION_PROMPT = ("You are the perception module of a content platform. Describe this material faithfully "
                 "for a writer who cannot see it: the subject, every visible piece of text (transcribe it exactly), "
                 "numbers, charts and their values, people, logos and setting. Do not speculate.")


def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _pdf_pages(data: bytes, limit: int = 6) -> list[tuple[bytes, str]]:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(data)
    out = []
    for i in range(min(len(pdf), limit)):
        img = pdf[i].render(scale=1.4).to_pil()
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=80)
        out.append((buf.getvalue(), "image/jpeg"))
    return out


def _video_split(data: bytes, suffix: str, frames: int = 6) -> tuple[bytes | None, list[tuple[bytes, str]]]:
    ff = _ffmpeg()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"in{suffix}"
        src.write_bytes(data)
        audio = Path(tmp) / "audio.flac"
        subprocess.run([ff, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(audio)],
                       capture_output=True, timeout=300)
        subprocess.run([ff, "-y", "-i", str(src), "-vf", "fps=1/8,scale=768:-2", "-frames:v", str(frames),
                        str(Path(tmp) / "f%02d.jpg")], capture_output=True, timeout=300)
        imgs = [(p.read_bytes(), "image/jpeg") for p in sorted(Path(tmp).glob("f*.jpg"))]
        return (audio.read_bytes() if audio.exists() and audio.stat().st_size > 1000 else None), imgs


async def perceive(engine, source: Source) -> tuple[str, dict]:
    usage = {"model": None, "input_tokens": 0, "output_tokens": 0}
    parts: list[str] = []
    if source.kind == "image":
        text, usage = await engine.describe_images([(source.media, source.mime)], VISION_PROMPT)
        parts.append(f"[Image content]\n{text}")
    elif source.mime == "application/pdf":
        pages = await asyncio.to_thread(_pdf_pages, source.media)
        text, usage = await engine.describe_images(pages, VISION_PROMPT + " These are pages of one document, in order.")
        parts.append(f"[Document pages]\n{text}")
    elif source.kind == "audio":
        parts.append(f"[Audio transcript]\n{await engine.transcribe(source.media)}")
    elif source.kind == "video":
        suffix = "." + (source.name.rsplit(".", 1)[-1] if "." in source.name else "mp4")
        audio, frames = await asyncio.to_thread(_video_split, source.media, suffix)
        if audio:
            parts.append(f"[Video transcript]\n{await engine.transcribe(audio)}")
        if frames:
            text, usage = await engine.describe_images(frames, VISION_PROMPT + " These are keyframes of one video, in order.")
            parts.append(f"[Video keyframes]\n{text}")
    return "\n\n".join(parts), usage
