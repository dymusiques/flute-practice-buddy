"""谱面预览图：PDF 转 PNG，避免浏览器 iframe 黑屏。"""

from pathlib import Path
import shutil


def render_sheet_preview(source: Path, dest: Path, *, scale: float = 2.0) -> bool:
    """
    生成可在 <img> 中显示的谱面预览。
    PDF 仅渲染第一页；图片格式直接复制。
    """
    if not source.exists():
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    suffix = source.suffix.lower()

    if suffix == ".pdf":
        try:
            import pymupdf

            doc = pymupdf.open(source)
            if doc.page_count == 0:
                return False
            matrix = pymupdf.Matrix(scale, scale)
            doc[0].get_pixmap(matrix=matrix).save(dest)
            return dest.exists() and dest.stat().st_size > 0
        except Exception:
            return False

    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        try:
            shutil.copy2(source, dest)
            return dest.exists()
        except Exception:
            return False

    return False
