"use client";

import { Minus, Plus } from "lucide-react";
import TempoMark from "@/components/TempoMark";
import {
  TEMPO_MAX,
  TEMPO_MIN,
  type TempoBeatUnit,
} from "@/lib/tempo-notation";

interface RecordingTempoPickerProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  tempo: number;
  onTempoChange: (tempo: number) => void;
  /** 与上方「谱面速度标记」一致，仅用于展示 ♩= 数字 */
  beatUnit: TempoBeatUnit;
  beatUnitAuto?: boolean;
}

export default function RecordingTempoPicker({
  enabled,
  onEnabledChange,
  tempo,
  onTempoChange,
  beatUnit,
  beatUnitAuto = false,
}: RecordingTempoPickerProps) {
  const clamp = (v: number) => Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, v));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">录音时的速度</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          若清楚录音用的节拍器数字，在此填写即可；一拍用哪种音符与上方「谱面速度标记」相同
          {beatUnitAuto ? "（可自动从谱面识别）" : ""}。不填则系统自动检测。
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="w-5 h-5 accent-primary"
        />
        <span className="text-sm font-medium">我知道录音时的速度</span>
      </label>

      {enabled && (
        <div className="space-y-3 pt-1 border-t border-primary/10">
          <div className="flex flex-col items-center gap-2">
            <TempoMark tempo={tempo} unit={beatUnit} numberClassName="text-2xl font-extrabold text-primary-dark" />
            <div className="flex items-center gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={() => onTempoChange(clamp(tempo - 4))}
                className="cute-btn cute-btn-secondary !p-2"
                aria-label="减慢"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={TEMPO_MIN}
                max={TEMPO_MAX}
                step={1}
                value={tempo}
                onChange={(e) => onTempoChange(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <button
                type="button"
                onClick={() => onTempoChange(clamp(tempo + 4))}
                className="cute-btn cute-btn-secondary !p-2"
                aria-label="加快"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <input
              type="number"
              min={TEMPO_MIN}
              max={TEMPO_MAX}
              value={tempo}
              onChange={(e) => onTempoChange(clamp(Number(e.target.value) || TEMPO_MIN))}
              className="w-20 text-center rounded-xl border-2 border-primary/20 px-2 py-1 text-sm font-bold"
            />
          </div>
        </div>
      )}
    </div>
  );
}
