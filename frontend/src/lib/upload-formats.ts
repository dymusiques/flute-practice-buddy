/** 谱面文件 */
export const SHEET_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp"] as const;

export const SHEET_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf";

export const SHEET_FORMATS_LABEL =
  "支持格式：PNG、JPG、JPEG、WEBP、PDF（可拖放或点击选择）";

/** 演奏 — 音频（含 iPhone / 安卓常见录音格式） */
export const PERF_AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "wav",
  "caf",
  "aiff",
  "aif",
  "flac",
  "ogg",
  "oga",
  "amr",
  "3gp",
  "webm",
] as const;

/** 演奏 — 视频 */
export const PERF_VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "3gp",
  "webm",
  "avi",
  "mkv",
] as const;

export const PERF_EXTENSIONS = [
  ...new Set([...PERF_AUDIO_EXTENSIONS, ...PERF_VIDEO_EXTENSIONS]),
];

export const PERF_ACCEPT = [
  ...PERF_EXTENSIONS.map((ext) => `.${ext}`),
  "audio/*",
  "video/*",
].join(",");

export const PERF_FORMATS_LABEL = [
  "支持格式：MP3、MP4（常用）",
  "音频：M4A、AAC、WAV、CAF、AIFF、FLAC、OGG、AMR、3GP、WEBM",
  "视频：MOV、M4V、AVI、MKV、WEBM（兼容 iPhone / 安卓手机直录）",
  "可拖放或点击选择",
].join("\n");

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/x-caf": "caf",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/3gpp": "3gp",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
};

export function fileExtension(file: File): string {
  return file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
}

export function fileMatchesExtensions(file: File, allowedExtensions: readonly string[]): boolean {
  const ext = fileExtension(file);
  if (ext && allowedExtensions.includes(ext)) return true;

  const fromMime = MIME_TO_EXT[file.type.toLowerCase()];
  return Boolean(fromMime && allowedExtensions.includes(fromMime));
}

export function detectPerformanceType(file: File): "audio" | "video" {
  const ext = fileExtension(file) || MIME_TO_EXT[file.type.toLowerCase()] || "";
  return PERF_VIDEO_EXTENSIONS.includes(ext as (typeof PERF_VIDEO_EXTENSIONS)[number])
    ? "video"
    : "audio";
}
