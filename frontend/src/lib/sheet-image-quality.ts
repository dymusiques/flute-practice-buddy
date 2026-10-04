/** 谱面清晰度检测（与后端规则对齐，选文件时 upfront 提示） */

const SHARPNESS_MIN = 150;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 480;

function laplacianVariance(gray: Float64Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = y * width + x;
      const lap =
        gray[c - width] +
        gray[c - 1] +
        gray[c + 1] +
        gray[c + width] -
        4 * gray[c];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function sampleGrayFromImageData(data: Uint8ClampedArray, srcW: number, srcH: number): {
  gray: Float64Array;
  width: number;
  height: number;
  origW: number;
  origH: number;
} {
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const gray = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x / width) * srcW));
      const sy = Math.min(srcH - 1, Math.floor((y / height) * srcH));
      const i = (sy * srcW + sx) * 4;
      gray[y * width + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return { gray, width, height, origW: srcW, origH: srcH };
}

export type SheetQualityResult = {
  ok: boolean;
  message?: string;
  skipped?: boolean;
};

export async function checkSheetImageQuality(file: File): Promise<SheetQualityResult> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (ext === "pdf") {
    return { ok: true, skipped: true };
  }
  if (!file.type.startsWith("image/") && !["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return { ok: true, skipped: true };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width: srcW, height: srcH } = bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: true, skipped: true };
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, srcW, srcH);
    const { gray, width, height, origW, origH } = sampleGrayFromImageData(
      imageData.data,
      srcW,
      srcH
    );

    if (origW < MIN_WIDTH || origH < MIN_HEIGHT) {
      return {
        ok: false,
        message: `谱面分辨率偏低（${origW}×${origH}），请靠近拍摄或换更清晰的文件`,
      };
    }

    const sharpness = laplacianVariance(gray, width, height);
    if (sharpness < SHARPNESS_MIN) {
      return {
        ok: false,
        message: "谱面图片偏模糊，请重新上传更清晰的谱面（光线充足、谱子铺平、对焦清晰）",
      };
    }

    return { ok: true };
  } catch {
    return { ok: true, skipped: true };
  }
}
