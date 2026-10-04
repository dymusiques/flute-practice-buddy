/** 速度标记：谱面/节拍器上「音符 = 数字」的音符种类 */

export type TempoBeatUnit = "half" | "quarter" | "eighth";

export const TEMPO_BEAT_UNITS: {
  id: TempoBeatUnit;
  label: string;
  /** 纯文本 fallback（界面优先用 TempoNoteSvg） */
  symbol: string;
}[] = [
  { id: "half", label: "二分音符", symbol: "二分音符" },
  { id: "quarter", label: "四分音符", symbol: "四分音符" },
  { id: "eighth", label: "八分音符", symbol: "八分音符" },
];

export const TEMPO_MIN = 25;
export const TEMPO_MAX = 250;

export function getTempoBeatUnit(id: TempoBeatUnit) {
  return TEMPO_BEAT_UNITS.find((u) => u.id === id) ?? TEMPO_BEAT_UNITS[1];
}

/** 纯文本速度标记（无 SVG 场景）；界面请用 TempoMark 组件 */
export function formatTempoMark(tempo: number, unit: TempoBeatUnit = "quarter"): string {
  const label = getTempoBeatUnit(unit).label;
  return `${label} = ${Math.round(tempo)}`;
}

/** 用户标记 → 内部分析用四分音符速度 */
export function tempoToQuarterBpm(tempo: number, unit: TempoBeatUnit): number {
  switch (unit) {
    case "half":
      return tempo * 2;
    case "eighth":
      return tempo / 2;
    default:
      return tempo;
  }
}

/** 四分音符速度 → 当前单位下的显示数字 */
export function quarterBpmToTempo(quarterBpm: number, unit: TempoBeatUnit): number {
  switch (unit) {
    case "half":
      return Math.round(quarterBpm / 2);
    case "eighth":
      return Math.round(quarterBpm * 2);
    default:
      return Math.round(quarterBpm);
  }
}

/** 根据拍号猜测谱面常用速度单位 */
export function guessTempoBeatUnit(timeSignature?: string | null): TempoBeatUnit {
  if (!timeSignature) return "quarter";
  const m = timeSignature.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return "quarter";
  const denom = parseInt(m[2], 10);
  if (denom === 2) return "half";
  if (denom === 8) return "eighth";
  return "quarter";
}
