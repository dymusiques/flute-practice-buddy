/** 五项评分维度 — 仅勾选项计入总分 */

import type { ScoreBreakdown } from "@/lib/api";

export type DimensionKey =
  | "pitch_accuracy"
  | "note_correctness"
  | "rhythm_accuracy"
  | "tone_quality"
  | "posture";

export interface DimensionMeta {
  key: DimensionKey;
  label: string;
  maxPoints: number;
  defaultChecked: boolean;
  requiresVisual?: boolean;
}

export const SCORE_DIMENSIONS: DimensionMeta[] = [
  { key: "rhythm_accuracy", label: "节奏", maxPoints: 30, defaultChecked: true },
  { key: "tone_quality", label: "音质", maxPoints: 25, defaultChecked: true },
  { key: "note_correctness", label: "音名对错", maxPoints: 20, defaultChecked: true },
  { key: "pitch_accuracy", label: "音准", maxPoints: 15, defaultChecked: true },
  { key: "posture", label: "姿势", maxPoints: 10, defaultChecked: false, requiresVisual: true },
];

export function dimensionScoresFromBreakdown(
  scores: ScoreBreakdown
): Record<DimensionKey, number> {
  const map = {} as Record<DimensionKey, number>;
  if (scores.dimensions?.length) {
    for (const d of scores.dimensions) {
      if (d.key === "tempo_consistency") continue;
      map[d.key as DimensionKey] = d.score;
    }
    return map;
  }
  return {
    pitch_accuracy: scores.pitch_accuracy,
    note_correctness: scores.note_correctness,
    rhythm_accuracy: scores.rhythm_accuracy,
    tone_quality: scores.tone_quality,
    posture: scores.posture,
  };
}

export function defaultCheckedDimensions(): Record<DimensionKey, boolean> {
  return Object.fromEntries(
    SCORE_DIMENSIONS.map((d) => [d.key, d.defaultChecked])
  ) as Record<DimensionKey, boolean>;
}

const CATEGORY_DIM_MAP: Record<string, DimensionKey> = {
  节奏: "rhythm_accuracy",
  音质: "tone_quality",
  气声: "tone_quality",
  音名对错: "note_correctness",
  音正确: "note_correctness",
  音正确性: "note_correctness",
  音准: "pitch_accuracy",
  音高: "pitch_accuracy",
  姿势: "posture",
};

export function dimensionKeyForCategory(category: string): DimensionKey | null {
  if (/节拍|速度|节拍器/.test(category)) return null;
  for (const [kw, key] of Object.entries(CATEGORY_DIM_MAP)) {
    if (category.includes(kw)) return key;
  }
  return "pitch_accuracy";
}

export function checkedDimensionKeys(
  checked: Record<DimensionKey, boolean>,
  postureAvailable: boolean
): DimensionKey[] {
  return SCORE_DIMENSIONS.filter((dim) => {
    if (!checked[dim.key]) return false;
    if (dim.requiresVisual && !postureAvailable) return false;
    return true;
  }).map((d) => d.key);
}

export function hasActiveDimensionSelection(
  checked: Record<DimensionKey, boolean>,
  postureAvailable: boolean
): boolean {
  return checkedDimensionKeys(checked, postureAvailable).length > 0;
}

export function dimensionsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function checkedFromKeys(keys: string[] | undefined | null): Record<DimensionKey, boolean> {
  const base = defaultCheckedDimensions();
  if (!keys?.length) return base;
  const set = new Set(keys.filter((k) => k !== "tempo_consistency"));
  for (const dim of SCORE_DIMENSIONS) {
    base[dim.key] = set.has(dim.key);
  }
  return base;
}

export function sumSelectedScore(
  scores: Record<DimensionKey, number>,
  checked: Record<DimensionKey, boolean>,
  postureAvailable: boolean
): { total: number; max: number } {
  let total = 0;
  let max = 0;
  for (const dim of SCORE_DIMENSIONS) {
    if (!checked[dim.key]) continue;
    if (dim.requiresVisual && !postureAvailable) continue;
    total += scores[dim.key] ?? 0;
    max += dim.maxPoints;
  }
  return { total: Math.round(total * 10) / 10, max };
}

export function gradeFromPercent(pct: number): { grade: string; stars: number } {
  if (pct >= 100) return { grade: "满分大师 🏆", stars: 3 };
  if (pct >= 90) return { grade: "优秀 ⭐", stars: 3 };
  if (pct >= 80) return { grade: "良好 👍", stars: 2 };
  if (pct >= 70) return { grade: "合格 ✅", stars: 2 };
  if (pct >= 60) return { grade: "需努力 💪", stars: 1 };
  return { grade: "继续加油 🌱", stars: 1 };
}
