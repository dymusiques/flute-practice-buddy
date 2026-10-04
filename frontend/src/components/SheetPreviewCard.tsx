"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";

interface SheetPreviewCardProps {
  mediaUrl?: string | null;
  previewUrl?: string | null;
  filename?: string | null;
  recognizedTitle?: string | null;
}

function displayTitle(recognizedTitle?: string | null): string | null {
  if (!recognizedTitle) return null;
  if (recognizedTitle === "谱面识谱未成功" || recognizedTitle === "未识别曲目") return null;
  return recognizedTitle;
}

export default function SheetPreviewCard({
  mediaUrl,
  previewUrl,
  filename,
  recognizedTitle,
}: SheetPreviewCardProps) {
  const imageUrl = previewUrl || mediaUrl;
  if (!filename && !imageUrl && !displayTitle(recognizedTitle)) return null;

  const title = displayTitle(recognizedTitle);
  const [expanded, setExpanded] = useState(false);

  const close = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, close]);

  return (
    <div className="cute-card p-4 overflow-hidden">
      {imageUrl && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="group w-full rounded-xl border border-[var(--border)] bg-slate-50 overflow-hidden mb-3 text-left cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="点击放大谱面"
          >
            <div className="relative w-full h-52 sm:h-60 bg-white">
              <img
                src={imageUrl}
                alt={title || filename || "谱面"}
                className="w-full h-full object-contain object-top"
              />
              <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/55 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-3.5 h-3.5" />
                放大
              </span>
            </div>
          </button>

          {expanded && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label="谱面大图"
              onClick={close}
            >
              <button
                type="button"
                onClick={close}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/90 text-foreground shadow-lg hover:bg-white"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={imageUrl}
                alt={title || filename || "谱面"}
                className="max-h-[92vh] max-w-full object-contain rounded-lg shadow-2xl bg-white"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </>
      )}

      {title && (
        <p className="text-sm font-bold text-foreground leading-snug">{title}</p>
      )}

      {filename && (
        <p
          className={`text-xs break-all leading-snug ${title ? "text-muted mt-1" : "text-sm font-bold text-foreground"}`}
          title={filename}
        >
          {filename}
        </p>
      )}
    </div>
  );
}
