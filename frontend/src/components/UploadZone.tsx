"use client";

import { useCallback, useState } from "react";
import { Upload, Camera, Music, Video } from "lucide-react";
import clsx from "clsx";
import { fileMatchesExtensions } from "@/lib/upload-formats";

interface UploadZoneProps {
  label: string;
  hint: string;
  accept: string;
  /** 例如「支持 PNG、JPG、PDF」 */
  supportedFormats?: string;
  /** 允许的后缀（小写，不含点）；拖放与选择时都会校验 */
  allowedExtensions?: string[];
  icon?: "sheet" | "audio" | "video";
  file: File | null;
  onFile: (file: File | null) => void;
}

const icons = {
  sheet: Camera,
  audio: Music,
  video: Video,
};

export default function UploadZone({
  label,
  hint,
  accept,
  supportedFormats,
  allowedExtensions,
  icon = "sheet",
  file,
  onFile,
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const Icon = icons[icon];

  const pickFile = useCallback(
    (picked: File | null | undefined) => {
      if (!picked) return;
      if (allowedExtensions && !fileMatchesExtensions(picked, allowedExtensions)) {
        setFormatError(supportedFormats ? `不支持的格式，${supportedFormats}` : "不支持的文件格式");
        return;
      }
      setFormatError(null);
      onFile(picked);
    },
    [allowedExtensions, onFile, supportedFormats]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      pickFile(e.dataTransfer.files[0]);
    },
    [pickFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={clsx(
        "cute-card p-6 text-center cursor-pointer transition-all border-dashed border-4",
        dragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-primary/30 hover:border-primary/60"
      )}
    >
      <label className="cursor-pointer block">
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-secondary/40 flex items-center justify-center">
            {file ? <Upload className="w-8 h-8 text-primary" /> : <Icon className="w-8 h-8 text-primary" />}
          </div>
          <p className="font-bold text-lg">{label}</p>
          <p className="text-sm text-muted">{hint}</p>
          {supportedFormats && (
            <p className="text-xs text-muted/90 whitespace-pre-line max-w-md">{supportedFormats}</p>
          )}
          {formatError && (
            <p className="text-xs font-semibold text-red-600">{formatError}</p>
          )}
          {file ? (
            <p className="text-sm font-semibold text-primary-dark bg-primary/10 px-4 py-1 rounded-full">
              ✅ {file.name}
            </p>
          ) : (
            <span className="cute-btn text-sm inline-block mt-1">点击或拖放上传</span>
          )}
        </div>
      </label>
    </div>
  );
}
