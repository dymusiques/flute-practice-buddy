"use client";

import { AlertCircle, AlertTriangle, Volume2 } from "lucide-react";
import type { ScoreDeduction } from "@/lib/api";
import {
  checkedDimensionKeys,
  dimensionKeyForCategory,
  type DimensionKey,
} from "@/lib/score-dimensions";

interface DeductionListProps {
  deductions: ScoreDeduction[];
  checked?: Record<DimensionKey, boolean>;
  postureAvailable?: boolean;
}

function filterDeductions(
  deductions: ScoreDeduction[],
  checked?: Record<DimensionKey, boolean>,
  postureAvailable = true
): ScoreDeduction[] {
  if (!checked) return deductions;
  const active = new Set(checkedDimensionKeys(checked, postureAvailable));
  return deductions.filter((d) => {
    const key = dimensionKeyForCategory(d.category);
    return key != null && active.has(key);
  });
}

function LocationBadge({ d }: { d: ScoreDeduction }) {
  const label =
    d.location && d.location !== "演奏中"
      ? d.location
      : d.timestamp_sec != null
        ? `录音 ${Math.floor(d.timestamp_sec / 60)}:${Math.floor(d.timestamp_sec % 60)
            .toString()
            .padStart(2, "0")}`
        : null;
  if (!label) return null;
  return (
    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold">
      📍 {label}
    </span>
  );
}

export default function DeductionList({
  deductions,
  checked,
  postureAvailable = true,
}: DeductionListProps) {
  const visible = filterDeductions(deductions, checked, postureAvailable);

  if (visible.length === 0) {
    return (
      <div className="cute-card p-6 text-center">
        <div className="text-4xl mb-2">🎉</div>
        <p className="font-extrabold text-lg text-success">所选项目零扣分！</p>
      </div>
    );
  }

  return (
    <div className="cute-card p-6">
      <h3 className="text-xl font-extrabold mb-4">📋 扣分明细</h3>
      <p className="text-sm text-muted mb-4">
        每一项标注了谱面位置，可回放该处录音片段对照谱面
      </p>

      <div className="space-y-3">
        {visible.map((d, idx) => (
          <div
            key={d.id}
            className={`p-4 rounded-2xl border-2 ${
              d.severity === "error"
                ? "border-red-200 bg-red-50/50"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {d.severity === "error" ? (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-extrabold text-primary-dark">−{d.points} 分</span>
                  <span className="px-2 py-0.5 bg-white rounded-full text-xs font-bold text-muted">
                    {d.category}
                  </span>
                  <LocationBadge d={d} />
                </div>
                <p className="font-bold text-foreground">{d.reason}</p>
                <p className="text-sm text-muted mt-1">💡 {d.suggestion}</p>

                {d.clip_url && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-primary/20">
                    <p className="text-xs font-bold text-primary mb-2 flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5" />
                      听这一处的演奏
                    </p>
                    <audio
                      controls
                      preload="metadata"
                      playsInline
                      src={d.clip_url}
                      className="w-full h-9"
                    />
                  </div>
                )}
              </div>
              <span className="text-xs font-bold text-muted flex-shrink-0">#{idx + 1}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
