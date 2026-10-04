"""谱面图片/PDF 清晰度检测（前后端规则尽量一致）。"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# 拉普拉斯方差：清晰谱面通常 > 500；严重模糊 < 100
SHARPNESS_MIN = 150.0
MIN_WIDTH = 480
MIN_HEIGHT = 480

_LAPLACIAN_KERNEL = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)


def pdf_first_page_to_png(pdf_path: Path, scale: float = 2.0) -> tuple[Path, bool]:
    """PDF 首页转 PNG，返回 (路径, 是否临时文件)。"""
    try:
        import pymupdf

        doc = pymupdf.open(pdf_path)
        if doc.page_count == 0:
            return pdf_path, False
        tmp = pdf_path.parent / f"{pdf_path.stem}_quality.png"
        doc[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(tmp)
        return tmp, True
    except Exception:
        return pdf_path, False


def _laplacian_variance(gray: np.ndarray) -> float:
    lap = ndimage.convolve(gray, _LAPLACIAN_KERNEL)
    return float(lap.var())


def _load_gray_array(path: Path) -> tuple[np.ndarray, int, int]:
    img = Image.open(path).convert("L")
    width, height = img.size
    if max(width, height) > 1200:
        ratio = 1200 / max(width, height)
        img = img.resize(
            (int(width * ratio), int(height * ratio)),
            Image.Resampling.LANCZOS,
        )
    return np.asarray(img, dtype=np.float64), width, height


def check_raster_image_quality(path: Path) -> tuple[bool, str, float, int, int]:
    """
    返回 (是否通过, 提示信息, 清晰度分数, 宽, 高)
    """
    try:
        gray, width, height = _load_gray_array(path)
    except Exception:
        return False, "无法读取谱面图片，请换 PNG、JPG 或 PDF 后重试", 0.0, 0, 0

    if width < MIN_WIDTH or height < MIN_HEIGHT:
        return (
            False,
            f"谱面分辨率偏低（{width}×{height}），请靠近拍摄或换更清晰的文件",
            0.0,
            width,
            height,
        )

    sharpness = _laplacian_variance(gray)
    if sharpness < SHARPNESS_MIN:
        return (
            False,
            "谱面图片偏模糊，请重新上传更清晰的谱面（光线充足、谱子铺平、对焦清晰）",
            sharpness,
            width,
            height,
        )

    return True, "", sharpness, width, height


def check_sheet_file_quality(path: Path) -> tuple[bool, str]:
    """检查谱面文件（PDF 会先转首页 PNG）。"""
    suffix = path.suffix.lower()
    temp_png: Path | None = None
    is_temp = False

    try:
        check_path = path
        if suffix == ".pdf":
            check_path, is_temp = pdf_first_page_to_png(path)
            if is_temp:
                temp_png = check_path

        ok, message, _, _, _ = check_raster_image_quality(check_path)
        return ok, message
    finally:
        if is_temp and temp_png and temp_png.exists():
            temp_png.unlink(missing_ok=True)
