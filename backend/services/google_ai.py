import asyncio
from pathlib import Path

from backend.config import settings

_client = None


def _get_client():
    global _client
    if not settings.google_api_key:
        return None
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=settings.google_api_key)
    return _client


def is_google_configured() -> bool:
    return bool(settings.google_api_key)


async def generate_text(prompt: str, *, system: str | None = None) -> str | None:
    client = _get_client()
    if not client:
        return None

    contents = f"{system}\n\n{prompt}" if system else prompt

    def _call():
        from google.genai import types

        return client.models.generate_content(
            model=settings.google_model,
            contents=contents,
            config=types.GenerateContentConfig(temperature=0.4),
        )

    try:
        response = await asyncio.to_thread(_call)
        text = (response.text or "").strip()
        return text or None
    except Exception:
        return None


def _mime_for_path(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    if suffix == "pdf":
        return "application/pdf"
    if suffix in {"jpg", "jpeg"}:
        return "image/jpeg"
    if suffix == "png":
        return "image/png"
    if suffix == "webp":
        return "image/webp"
    if suffix == "gif":
        return "image/gif"
    return "image/jpeg"


def pdf_to_png(path: Path, scale: float = 2.0, all_pages: bool = True) -> tuple[Path, bool]:
    """PDF → PNG；多页时纵向拼接所有页。返回 (路径, 是否临时文件)。"""
    if path.suffix.lower() != ".pdf":
        return path, False
    try:
        import pymupdf
        from PIL import Image

        doc = pymupdf.open(path)
        if doc.page_count == 0:
            return path, False

        matrix = pymupdf.Matrix(scale, scale)
        pixmaps = [doc[i].get_pixmap(matrix=matrix) for i in range(doc.page_count if all_pages else 1)]

        if len(pixmaps) == 1:
            tmp = path.parent / f"{path.stem}_vision_{scale:.0f}x.png"
            pixmaps[0].save(tmp)
            return tmp, True

        images = [Image.frombytes("RGB", (p.width, p.height), p.samples) for p in pixmaps]
        width = max(img.width for img in images)
        height = sum(img.height for img in images)
        combined = Image.new("RGB", (width, height), "white")
        y_off = 0
        for img in images:
            combined.paste(img, (0, y_off))
            y_off += img.height
        tmp = path.parent / f"{path.stem}_vision_{scale:.0f}x_p{doc.page_count}.png"
        combined.save(tmp)
        return tmp, True
    except Exception:
        return path, False


async def _vision_request(prompt: str, file_path: Path, mime: str) -> str | None:
    client = _get_client()
    if not client:
        return None

    file_bytes = file_path.read_bytes()

    def _call():
        from google.genai import types

        return client.models.generate_content(
            model=settings.google_model,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=file_bytes, mime_type=mime),
                    ],
                )
            ],
            config=types.GenerateContentConfig(temperature=0.2),
        )

    try:
        response = await asyncio.to_thread(_call)
        return (response.text or "").strip() or None
    except Exception:
        return None


async def generate_text_with_image(prompt: str, image_path: Path) -> str | None:
    """
    识谱专用：PDF 先直读，失败再自动转 PNG 重试（仅后端，不对用户展示）。
    普通图片直接识别。
    """
    suffix = image_path.suffix.lower()
    temp_files: list[Path] = []

    try:
        if suffix == ".pdf":
            # 1) 官方路径：直接 PDF
            text = await _vision_request(prompt, image_path, "application/pdf")
            if text:
                return text

            # 2) 重试：全部页转 PNG 纵向拼接（2x）
            png_path, is_temp = pdf_to_png(image_path, scale=2.0)
            if is_temp:
                temp_files.append(png_path)
            if png_path.suffix.lower() == ".png":
                text = await _vision_request(prompt, png_path, "image/png")
                if text:
                    return text

            # 3) 重试：更高分辨率 PNG（3x）
            png_hd, is_temp_hd = pdf_to_png(image_path, scale=3.0)
            if is_temp_hd:
                temp_files.append(png_hd)
            if png_hd.suffix.lower() == ".png" and png_hd != png_path:
                return await _vision_request(prompt, png_hd, "image/png")

            return None

        mime = _mime_for_path(image_path)
        return await _vision_request(prompt, image_path, mime)
    finally:
        for tmp in temp_files:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
