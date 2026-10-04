"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Minus, Plus } from "lucide-react";
import { playClick } from "@/lib/audio-tools";
import {
  BEATS_PER_MEASURE_OPTIONS,
  RHYTHM_PATTERNS,
  buildMeasureTicks,
  getNotationCells,
  getPattern,
  getPatternPreviewNotation,
  getMeasureUnitCount,
  getUnitDurationMs,
  gridSubToHighlight,
  notationSpanBeats,
  patternUsesTripletMark,
  type RhythmPatternId,
} from "@/lib/rhythm-patterns";
import {
  TEMPO_MAX,
  TEMPO_MIN,
  quarterBpmToTempo,
  tempoToQuarterBpm,
  type TempoBeatUnit,
} from "@/lib/tempo-notation";
import TempoBeatUnitPicker from "@/components/TempoBeatUnitPicker";
import TempoMark from "@/components/TempoMark";
import RhythmNotationSvg from "@/components/RhythmNotationSvg";

const CATEGORIES = ["基础", "十六分", "切分", "连音", "复合"] as const;

export default function Metronome() {
  const [tempo, setTempo] = useState(88);
  const [beatUnit, setBeatUnit] = useState<TempoBeatUnit>("quarter");
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [rhythmPattern, setRhythmPattern] = useState<RhythmPatternId>("quarter");
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentSub, setCurrentSub] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unitIndexRef = useRef(0);
  const tickMapRef = useRef<Map<number, { level: Parameters<typeof playClick>[1]; beat: number; sub: number }>>(
    new Map()
  );

  const quarterBpm = useMemo(() => tempoToQuarterBpm(tempo, beatUnit), [tempo, beatUnit]);

  const measureTicks = useMemo(
    () => buildMeasureTicks(rhythmPattern, beatsPerMeasure),
    [rhythmPattern, beatsPerMeasure]
  );

  const measureUnits = useMemo(
    () => getMeasureUnitCount(rhythmPattern, beatsPerMeasure),
    [rhythmPattern, beatsPerMeasure]
  );

  const notation = useMemo(
    () => getNotationCells(rhythmPattern, beatsPerMeasure),
    [rhythmPattern, beatsPerMeasure]
  );

  const patternDef = getPattern(rhythmPattern);
  const showTripletMark = patternUsesTripletMark(rhythmPattern);
  const displayBeats = beatsPerMeasure === 0 ? 1 : beatsPerMeasure;

  const handleBeatUnitChange = (next: TempoBeatUnit) => {
    const q = tempoToQuarterBpm(tempo, beatUnit);
    setBeatUnit(next);
    setTempo(quarterBpmToTempo(q, next));
  };

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setCurrentBeat(0);
    setCurrentSub(0);
    unitIndexRef.current = 0;
  }, []);

  const start = useCallback(() => {
    if (measureTicks.length === 0) return;
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const map = new Map<number, { level: Parameters<typeof playClick>[1]; beat: number; sub: number }>();
    for (const tick of measureTicks) {
      map.set(tick.unit, { level: tick.level, beat: tick.beat, sub: tick.sub });
    }
    tickMapRef.current = map;

    const unitMs = getUnitDurationMs(quarterBpm, rhythmPattern);
    unitIndexRef.current = 0;

    intervalRef.current = setInterval(() => {
      const u = unitIndexRef.current % measureUnits;
      const hit = tickMapRef.current.get(u);
      if (hit) {
        playClick(ctx, hit.level);
        setCurrentBeat(hit.beat);
        setCurrentSub(hit.sub);
      }
      unitIndexRef.current++;
    }, unitMs);

    setRunning(true);
  }, [quarterBpm, rhythmPattern, measureTicks, measureUnits]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (running) {
      stop();
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterBpm, beatsPerMeasure, rhythmPattern]);

  const handlePatternSelect = (id: RhythmPatternId) => {
    setRhythmPattern(id);
    const p = getPattern(id);
    if (p.recommendedBeats != null) setBeatsPerMeasure(p.recommendedBeats);
  };

  return (
    <div className="cute-card p-6">
      <h3 className="text-lg font-semibold mb-1">节拍器</h3>
      <p className="text-sm text-muted mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <TempoMark tempo={TEMPO_MIN} unit={beatUnit} numberClassName="text-sm font-semibold" noteSize={16} />
        <span>–</span>
        <TempoMark tempo={TEMPO_MAX} unit={beatUnit} numberClassName="text-sm font-semibold" noteSize={16} />
        <span>· 正拍重音 · 弱分音轻音</span>
      </p>

      <div className="mb-5">
        <TempoBeatUnitPicker value={beatUnit} onChange={handleBeatUnitChange} />
      </div>

      <div className="p-4 bg-slate-50 rounded-lg border border-[var(--border)] mb-5">
        <p className="text-xs font-medium text-muted mb-3">
          节奏记谱 · {beatsPerMeasure === 0 ? "自由模式" : `${beatsPerMeasure} 拍/小节`} · {patternDef.label}
        </p>
        <div className="flex flex-wrap gap-2">
          {notation.map(({ beat, notation: beatNotation, spanBeats }) => {
            const litBeat = running && currentBeat >= beat - 1 && currentBeat < beat - 1 + (spanBeats ?? 1);
            const lit = litBeat ? gridSubToHighlight(rhythmPattern, currentBeat, currentSub) : null;
            return (
            <div
              key={beat}
              className={`px-2 py-1.5 rounded-md border text-sm ${
                litBeat
                  ? beat === 1
                    ? "border-accent bg-amber-50"
                    : "border-primary bg-cyan-50"
                  : "border-transparent bg-white"
              }`}
            >
              <span className="text-[10px] text-muted mr-1">
                {spanBeats && spanBeats > 1 ? `${beat}–${beat + spanBeats - 1}` : beat}
              </span>
              <RhythmNotationSvg
                groups={beatNotation.groups}
                highlight={lit}
                triplet={showTripletMark && rhythmPattern === "triplet"}
                spanBeats={spanBeats ?? 1}
              />
            </div>
            );
          })}
        </div>
        {rhythmPattern === "hemiola_32" && (
          <p className="text-xs text-muted mt-2 leading-relaxed">
            三对二：2 拍内双拍（第 1、2 拍）与三连音（3 等分）叠置。重音=第 1 拍与双拍对齐点；中音=仅三连；次强=第 2 拍。
          </p>
        )}
      </div>

      {beatsPerMeasure > 0 && (
        <div className="flex justify-center gap-2 mb-5 flex-wrap">
          {Array.from({ length: displayBeats }).map((_, i) => (
            <div
              key={i}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                running && currentBeat === i
                  ? i === 0
                    ? "bg-accent text-white scale-110 metronome-beat"
                    : "bg-primary text-white scale-105 metronome-beat"
                  : "bg-slate-100 text-muted"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}

      <div className="text-center mb-4">
        <TempoMark tempo={tempo} unit={beatUnit} />
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setTempo((v) => Math.max(TEMPO_MIN, v - 4))} className="cute-btn cute-btn-secondary !p-2">
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="flex-1 accent-[var(--primary)]"
        />
        <button onClick={() => setTempo((v) => Math.min(TEMPO_MAX, v + 4))} className="cute-btn cute-btn-secondary !p-2">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-5">
        <p className="text-sm font-semibold mb-2">每小节拍数（0–9）</p>
        <div className="flex flex-wrap gap-2">
          {BEATS_PER_MEASURE_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setBeatsPerMeasure(n)}
              className={`min-w-[2.5rem] px-3 py-1.5 rounded-md text-sm font-medium ${
                beatsPerMeasure === n ? "bg-primary text-white" : "bg-slate-100 text-muted hover:bg-slate-200"
              }`}
              title={n === 0 ? "自由模式：无小节重音" : `${n} 拍/小节`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          {beatsPerMeasure === 0 ? "0 = 自由模式，仅按节奏型发声" : `${beatsPerMeasure} 拍/小节`}
        </p>
      </div>

      <div className="mb-6">
        <p className="text-sm font-semibold mb-2">节奏型</p>
        {CATEGORIES.map((cat) => {
          const items = RHYTHM_PATTERNS.filter((p) => p.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-3">
              <p className="text-xs font-medium text-muted mb-1">{cat}</p>
              <div className="grid gap-1.5">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePatternSelect(p.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                      rhythmPattern === p.id
                        ? "border-primary bg-cyan-50"
                        : "border-[var(--border)] bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <span className="font-medium text-sm">{p.label}</span>
                      <span className="text-xs text-muted ml-2">{p.desc}</span>
                    </div>
                    {getPatternPreviewNotation(p.id) ? (
                      <RhythmNotationSvg
                        groups={getPatternPreviewNotation(p.id)!.groups}
                        triplet={p.triplet}
                        compact
                        spanBeats={notationSpanBeats(p.id)}
                      />
                    ) : (
                      <span className="text-sm text-muted">{p.desc}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={running ? stop : start} className="cute-btn w-full inline-flex items-center justify-center gap-2">
        {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        {running ? "停止" : "开始"}
      </button>
    </div>
  );
}
