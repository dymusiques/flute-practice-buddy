import type { ClickLevel } from "./audio-tools";

/** 每小节拍数：0 = 自由模式（无小节重音），1–9 = 常规定义 */
export const BEATS_PER_MEASURE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type RhythmPatternId =
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "front_16"
  | "back_16"
  | "triplet"
  | "small_sync"
  | "big_sync"
  | "hemiola_32";

export type NoteKind = "4" | "8" | "16";

/** 一组符杠相连的音符（同一拍内可有多组，如大切分第二拍） */
export interface BeamedFigure {
  notes: NoteKind[];
}

export interface BeatNotation {
  groups: BeamedFigure[];
}

export interface RhythmPatternDef {
  id: RhythmPatternId;
  label: string;
  desc: string;
  category: "基础" | "十六分" | "切分" | "连音" | "复合";
  cycleBeats: number;
  cycleUnits: number;
  hits: number[];
  levels?: ClickLevel[];
  /** 每拍 SVG 记谱（符杠相连） */
  beatNotation?: BeatNotation[];
  /** 十六分网格每一格 → 高亮哪一组、组内第几个音 */
  gridHighlight?: { group: number; note: number }[];
  triplet?: boolean;
  minBeats?: number;
  recommendedBeats?: number;
}

/**
 * 记谱核对来源（英皇 Grade 1 符杠规则）：
 * - ABRSM Grade 1：Quavers/semiquavers 按 one crotchet beat 分组符杠；
 *   八分与十六分混合时亦同（Sharon Bill ABRSM Grade 1 配套 PDF）。
 * - My Music Theory Grade 1 Beaming：4/4 中十六分组合通常不超过一拍；
 *   十六+八+十六 共用主符杠，外圈十六分用 cut-off 副符杠。
 *
 * 一拍 = 4 个十六分位置。Unicode ♬ = 一对十六分，故用 SVG 绘制单音与符杠。
 */
export const RHYTHM_PATTERNS: RhythmPatternDef[] = [
  {
    id: "quarter",
    label: "四分音符",
    desc: "每拍 1 个四分音符",
    category: "基础",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 0, 0, 0],
    beatNotation: [{ groups: [{ notes: ["4"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 0 },
    ],
  },
  {
    id: "eighth",
    label: "两个八分音符",
    desc: "每拍 2 个八分连写",
    category: "基础",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 0, 1, 0],
    beatNotation: [{ groups: [{ notes: ["8", "8"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
    ],
  },
  {
    id: "sixteenth",
    label: "四个十六分音符",
    desc: "每拍 4 个十六分连写",
    category: "基础",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 1, 1, 1],
    beatNotation: [{ groups: [{ notes: ["16", "16", "16", "16"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
      { group: 0, note: 3 },
    ],
  },
  {
    id: "front_16",
    label: "前十六后八",
    desc: "两个十六分 + 一个八分，符杠相连",
    category: "十六分",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 1, 1, 0],
    beatNotation: [{ groups: [{ notes: ["16", "16", "8"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
      { group: 0, note: 2 },
    ],
  },
  {
    id: "back_16",
    label: "前八后十六",
    desc: "一个八分 + 两个十六分，符杠相连",
    category: "十六分",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 0, 1, 1],
    beatNotation: [{ groups: [{ notes: ["8", "16", "16"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
    ],
  },
  {
    id: "triplet",
    label: "三连音",
    desc: "一拍内 3 个八分连写",
    category: "连音",
    cycleBeats: 1,
    cycleUnits: 3,
    hits: [1, 1, 1],
    beatNotation: [{ groups: [{ notes: ["8", "8", "8"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
    ],
    triplet: true,
  },
  {
    id: "small_sync",
    label: "小切分",
    desc: "十六分+八分+十六分，共 1 拍",
    category: "切分",
    cycleBeats: 1,
    cycleUnits: 4,
    hits: [1, 1, 0, 1],
    beatNotation: [{ groups: [{ notes: ["16", "8", "16"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
    ],
  },
  {
    id: "big_sync",
    label: "大切分",
    desc: "两拍：八分 + 四分 + 八分，符杠相连",
    category: "切分",
    cycleBeats: 2,
    cycleUnits: 8,
    hits: [1, 0, 1, 0, 0, 0, 1, 0],
    /** 跨 2 拍一组：♪(拍1) + ♩(拍2) + ♪(拍2后半)，英皇 Grade 1 按拍分组符杠 */
    beatNotation: [{ groups: [{ notes: ["8", "4", "8"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
      { group: 0, note: 2 },
    ],
    minBeats: 2,
    recommendedBeats: 2,
  },
  {
    id: "hemiola_32",
    label: "三对二（3:2）",
    desc: "2 拍内：双拍 × 三连音叠置",
    category: "复合",
    cycleBeats: 2,
    /** LCM(2,3)=6：双拍在 0、3，三连在 0、2、4 */
    cycleUnits: 6,
    hits: [1, 0, 1, 1, 1, 0],
    levels: [
      "accent", "sub", "sub", "beat", "sub", "sub",
    ],
    beatNotation: [{ groups: [{ notes: ["8", "8", "8"] }] }],
    gridHighlight: [
      { group: 0, note: 0 },
      { group: 0, note: 0 },
      { group: 0, note: 1 },
      { group: 0, note: 1 },
      { group: 0, note: 2 },
      { group: 0, note: 2 },
    ],
    minBeats: 2,
    recommendedBeats: 2,
  },
];

export interface MetronomeTick {
  level: ClickLevel;
  beat: number;
  sub: number;
  unit: number;
}

export function getPattern(id: RhythmPatternId): RhythmPatternDef {
  return RHYTHM_PATTERNS.find((p) => p.id === id) ?? RHYTHM_PATTERNS[0];
}

export function buildMeasureTicks(
  patternId: RhythmPatternId,
  beatsPerMeasure: number
): MetronomeTick[] {
  const pattern = getPattern(patternId);
  const beats = Math.max(1, beatsPerMeasure || 1);
  const unitsPerBeat = pattern.cycleUnits / pattern.cycleBeats;
  const measureUnits = Math.round(beats * unitsPerBeat);

  const ticks: MetronomeTick[] = [];

  for (let u = 0; u < measureUnits; u++) {
    const posInCycle = u % pattern.cycleUnits;
    if (!pattern.hits[posInCycle]) continue;

    const beat = Math.floor(u / unitsPerBeat) % beats;
    const sub = u % Math.round(unitsPerBeat);

    let level: ClickLevel = pattern.levels?.[posInCycle] ?? "sub";

    if (beatsPerMeasure === 0) {
      level = "beat";
    } else if (!pattern.levels) {
      const isDownbeat = sub === 0;
      if (beat === 0 && isDownbeat) level = "accent";
      else if (isDownbeat) level = "beat";
      else level = "sub";
    }

    ticks.push({ level, beat: beatsPerMeasure === 0 ? 0 : beat, sub, unit: u });
  }

  return ticks;
}

/** 一小节共有多少个最小网格单位 */
export function getMeasureUnitCount(
  patternId: RhythmPatternId,
  beatsPerMeasure: number
): number {
  const pattern = getPattern(patternId);
  const beats = Math.max(1, beatsPerMeasure || 1);
  const unitsPerBeat = pattern.cycleUnits / pattern.cycleBeats;
  return Math.round(beats * unitsPerBeat);
}

/** 每个最小网格单位的时长（ms）。tempo 为四分音符速度（内部分析用） */
export function getUnitDurationMs(bpm: number, patternId: RhythmPatternId): number {
  const pattern = getPattern(patternId);
  const unitsPerBeat = pattern.cycleUnits / pattern.cycleBeats;
  return ((60 / bpm) / unitsPerBeat) * 1000;
}

/** @deprecated 仅用于兼容；实际调度应使用 getUnitDurationMs + 逐格推进 */
export function getTickIntervalMs(bpm: number, patternId: RhythmPatternId): number {
  return getUnitDurationMs(bpm, patternId);
}

export interface NotationRow {
  beat: number;
  notation: BeatNotation;
  /** 该记谱块跨越的小节拍数（大切分/三对二等） */
  spanBeats?: number;
}

export function getNotationCells(
  patternId: RhythmPatternId,
  beatsPerMeasure: number
): NotationRow[] {
  const pattern = getPattern(patternId);
  const beats = Math.max(1, beatsPerMeasure || 1);
  const rows: NotationRow[] = [];

  if (pattern.beatNotation?.length === 1 && pattern.cycleBeats > 1) {
    for (let b = 0; b < beats; b += pattern.cycleBeats) {
      rows.push({
        beat: b + 1,
        notation: pattern.beatNotation[0]!,
        spanBeats: pattern.cycleBeats,
      });
    }
    return rows;
  }

  for (let b = 0; b < beats; b++) {
    const cycleBeat = b % pattern.cycleBeats;
    const notation = pattern.beatNotation?.[cycleBeat] ?? {
      groups: [{ notes: ["4"] as NoteKind[] }],
    };
    rows.push({ beat: b + 1, notation });
  }
  return rows;
}

/** 取节奏型一个周期的记谱，用于列表预览 */
export function getPatternPreviewNotation(patternId: RhythmPatternId): BeatNotation | null {
  const pattern = getPattern(patternId);
  if (!pattern.beatNotation?.length) return null;
  if (pattern.cycleBeats > 1 && pattern.beatNotation.length === 1) {
    return pattern.beatNotation[0]!;
  }
  return pattern.beatNotation[0] ?? null;
}

/** 记谱组跨越几拍（用于加宽 SVG） */
export function notationSpanBeats(patternId: RhythmPatternId): number {
  const pattern = getPattern(patternId);
  if (pattern.id === "big_sync" || pattern.id === "hemiola_32") return pattern.cycleBeats;
  return 1;
}

export function gridSubToHighlight(
  patternId: RhythmPatternId,
  beatIndex: number,
  sub: number
): { group: number; note: number } {
  const pattern = getPattern(patternId);
  const unitsPerBeat = pattern.cycleUnits / pattern.cycleBeats;
  const cycleBeat = beatIndex % pattern.cycleBeats;
  const posInCycle = cycleBeat * Math.round(unitsPerBeat) + sub;
  return pattern.gridHighlight?.[posInCycle] ?? { group: 0, note: sub };
}

export function patternUsesTripletMark(patternId: RhythmPatternId): boolean {
  return getPattern(patternId).triplet === true;
}
