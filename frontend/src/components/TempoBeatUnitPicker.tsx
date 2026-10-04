"use client";

import {
  TEMPO_BEAT_UNITS,
  type TempoBeatUnit,
} from "@/lib/tempo-notation";
import TempoNoteSvg from "@/components/TempoNoteSvg";

interface TempoBeatUnitPickerProps {
  value: TempoBeatUnit;
  onChange: (unit: TempoBeatUnit) => void;
  compact?: boolean;
}

export default function TempoBeatUnitPicker({
  value,
  onChange,
  compact = false,
}: TempoBeatUnitPickerProps) {
  return (
    <div>
      {!compact && (
        <p className="text-sm font-semibold mb-2">一拍用哪种音符</p>
      )}
      <div className="flex flex-wrap gap-2">
        {TEMPO_BEAT_UNITS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onChange(u.id)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors inline-flex items-center gap-2 ${
              value === u.id
                ? "border-primary bg-cyan-50 text-primary-dark"
                : "border-[var(--border)] bg-white text-muted hover:bg-slate-50"
            }`}
            title={u.label}
          >
            <TempoNoteSvg unit={u.id} size={compact ? 18 : 22} />
            {!compact && <span>{u.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
