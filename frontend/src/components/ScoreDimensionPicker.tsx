"use client";

import {
  SCORE_DIMENSIONS,
  type DimensionKey,
} from "@/lib/score-dimensions";

interface ScoreDimensionPickerProps {
  checked: Record<DimensionKey, boolean>;
  onChange: (checked: Record<DimensionKey, boolean>) => void;
  postureAvailable?: boolean;
  /** 结果页展示每项得分 */
  scores?: Partial<Record<DimensionKey, number>>;
  compact?: boolean;
}

export default function ScoreDimensionPicker({
  checked,
  onChange,
  postureAvailable = false,
  scores,
  compact = false,
}: ScoreDimensionPickerProps) {
  const toggle = (key: DimensionKey) => {
    onChange({ ...checked, [key]: !checked[key] });
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          勾选本次要评的项目（只针对勾选项积分）
        </p>
      )}
      {SCORE_DIMENSIONS.map((dim) => {
        const needsVisual = Boolean(dim.requiresVisual && !postureAvailable);
        const isChecked = checked[dim.key] && !needsVisual;
        const score = scores?.[dim.key];

        return (
          <label
            key={dim.key}
            className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
              needsVisual
                ? "border-dashed border-gray-200 bg-gray-50/80 cursor-not-allowed"
                : isChecked
                  ? "border-primary/40 bg-primary/5 cursor-pointer"
                  : "border-transparent bg-background/60 cursor-pointer hover:bg-background"
            }`}
          >
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary shrink-0 ml-0.5"
              checked={isChecked}
              disabled={needsVisual}
              onChange={() => !needsVisual && toggle(dim.key)}
            />
            <span className={`flex-1 text-sm font-semibold ${needsVisual ? "text-muted" : "text-foreground"}`}>
              {dim.label}
            </span>
            {needsVisual ? (
              <span className="text-xs text-muted font-medium">需视频或图片</span>
            ) : scores && isChecked ? (
              <span className="text-sm font-black tabular-nums text-primary-dark">
                {Math.round((score ?? 0) * 10) / 10}/{dim.maxPoints}
              </span>
            ) : scores ? (
              <span className="text-xs text-muted">未选</span>
            ) : (
              <span className="text-xs text-muted tabular-nums">满分 {dim.maxPoints}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
