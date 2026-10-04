/** 以 A4=440 Hz 为基准的等律音高表 */
const NOTE_FREQ_A440: Record<string, number> = {
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, E4: 329.63,
  F4: 349.23, "F#4": 369.99, G4: 392.0, "G#4": 415.3, A4: 440.0,
  "A#4": 466.16, B4: 493.88, C5: 523.25, "C#5": 554.37, D5: 587.33,
  "D#5": 622.25, E5: 659.25, F5: 698.46, "F#5": 739.99, G5: 783.99,
  "G#5": 830.61, A5: 880.0, "A#5": 932.33, B5: 987.77, C6: 1046.5,
};

/** 各国/乐团常用的 A 标准音高 (Hz) — 中央 C 上方的 la */
export const A4_REFERENCE_OPTIONS = [440, 441, 442] as const;
export type A4Reference = (typeof A4_REFERENCE_OPTIONS)[number];

/** 有据可查的说明（非「一国一律」，以具体乐团为准） */
export const A4_REFERENCE_INFO: Record<A4Reference, string> = {
  440: "ISO 16 国际通用标准。英美及多数地区默认；法国当代音乐中心（Cité de la Musique）等少数团体也用 440。",
  441: "部分美国乐团曾用或仍用，如波士顿交响乐团（Wikipedia「Concert pitch」）。并非德国/荷兰的主流标准。",
  442: "欧洲大陆乐团最常见之一：德国、奥地利、荷兰、法国（巴黎多数音乐会）等；纽约爱乐等亦曾使用。",
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SOLFEGE_BY_LETTER: Record<string, string> = {
  C: "Do",
  D: "Re",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
};

/** 长笛常用一组参考音（中央 C 起的一个八度内自然音） */
export const SOLFEGE_REFERENCE = [
  { id: "C4", label: "Do" },
  { id: "D4", label: "Re" },
  { id: "E4", label: "Mi" },
  { id: "F4", label: "Fa" },
  { id: "G4", label: "Sol" },
  { id: "A4", label: "La" },
  { id: "B4", label: "Si" },
] as const;

export type SolfegeNoteId = (typeof SOLFEGE_REFERENCE)[number]["id"];

export function scientificNoteToSolfege(noteId: string): string {
  const match = noteId.match(/^([A-G])(#)?(-?\d+)?$/);
  if (!match) return noteId;
  const [, letter, sharp] = match;
  const base = SOLFEGE_BY_LETTER[letter];
  if (!base) return noteId;
  return sharp ? `${base}♯` : base;
}

export function freqToNote(freq: number, a4Ref: number = 440): { note: string; cents: number } {
  if (freq <= 0 || a4Ref <= 0) return { note: "—", cents: 0 };
  const noteNum = 12 * Math.log2(freq / a4Ref) + 69;
  const rounded = Math.round(noteNum);
  const cents = Math.round((noteNum - rounded) * 100);
  const scientific = `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
  return { note: scientificNoteToSolfege(scientific), cents };
}

export function getSolfegeLabel(noteId: string): string {
  return SOLFEGE_REFERENCE.find((n) => n.id === noteId)?.label ?? scientificNoteToSolfege(noteId);
}

/** 根据 A4 基准频率计算某音名的参考频率 */
export function getReferenceFreq(note: string, a4Ref: number = 440): number {
  const base = NOTE_FREQ_A440[note];
  if (!base) return a4Ref;
  return base * (a4Ref / 440);
}

export type ClickLevel = "accent" | "beat" | "sub";

const CLICK_PROFILE: Record<
  ClickLevel,
  { freq: number; gain: number; duration: number; type: OscillatorType }
> = {
  accent: { freq: 1400, gain: 0.45, duration: 0.07, type: "sine" },
  beat: { freq: 900, gain: 0.28, duration: 0.055, type: "triangle" },
  sub: { freq: 520, gain: 0.12, duration: 0.035, type: "square" },
};

export function playClick(ctx: AudioContext, level: ClickLevel | boolean = "beat") {
  const resolved: ClickLevel =
    typeof level === "boolean" ? (level ? "accent" : "beat") : level;
  const { freq, gain: vol, duration, type } = CLICK_PROFILE[resolved];
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = type;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

export function playTone(ctx: AudioContext, freq: number, duration = 0.3) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export interface ReferenceToneHandle {
  stop: () => void;
}

/** 持续参考音，供校音对照；需调用 stop() 结束 */
export function startReferenceTone(
  ctx: AudioContext,
  freq: number
): ReferenceToneHandle {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = "sine";

  const attack = 0.06;
  const level = 0.22;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + attack);

  osc.start(t);

  return {
    stop() {
      const now = ctx.currentTime;
      const release = 0.12;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(level, now);
      gain.gain.linearRampToValueAtTime(0, now + release);
      osc.stop(now + release + 0.02);
    },
  };
}

/** 从时域采样缓冲估计基频 (Hz)；无声或失败返回 -1 */
export function detectPitchHz(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmed = buf.slice(r1, r2);
  const len = trimmed.length;
  const c = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i; j++) c[i] += trimmed[j] * trimmed[j + i];
  }

  let d = 1;
  while (d < len - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -1;
  let maxPos = -1;
  const minPeriod = Math.floor(sampleRate / 1200);
  const maxPeriod = Math.floor(sampleRate / 60);
  for (let i = Math.max(d, minPeriod); i < Math.min(len, maxPeriod); i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }

  if (maxPos <= 0) return -1;

  const y1 = c[maxPos - 1] ?? c[maxPos];
  const y2 = c[maxPos];
  const y3 = c[maxPos + 1] ?? c[maxPos];
  const adj = y3 - y1 !== 0 ? (y3 - y1) / (2 * (2 * y2 - y1 - y3)) : 0;
  return sampleRate / (maxPos + adj);
}

/** 麦克风输入 RMS，用于判断是否有声音 */
export function bufferRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
