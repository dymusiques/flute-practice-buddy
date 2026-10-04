"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, AlertCircle, Volume2 } from "lucide-react";
import {
  A4_REFERENCE_INFO,
  A4_REFERENCE_OPTIONS,
  SOLFEGE_REFERENCE,
  bufferRms,
  detectPitchHz,
  freqToNote,
  getReferenceFreq,
  getSolfegeLabel,
  startReferenceTone,
  type A4Reference,
  type ReferenceToneHandle,
  type SolfegeNoteId,
} from "@/lib/audio-tools";

type MicStatus = "idle" | "requesting" | "listening" | "no_signal" | "error";

export default function Tuner() {
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micError, setMicError] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [freq, setFreq] = useState(0);
  const [note, setNote] = useState("—");
  const [cents, setCents] = useState(0);
  const [refNote, setRefNote] = useState<SolfegeNoteId>("A4");
  const [a4Ref, setA4Ref] = useState<A4Reference>(440);
  const [playingRef, setPlayingRef] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const refToneRef = useRef<ReferenceToneHandle | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const a4RefRef = useRef(a4Ref);
  const silentFramesRef = useRef(0);

  useEffect(() => {
    a4RefRef.current = a4Ref;
  }, [a4Ref]);

  const detectPitch = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !ctx) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const rms = bufferRms(buf);
    setInputLevel(Math.min(100, Math.round(rms * 800)));

    if (rms < 0.008) {
      silentFramesRef.current += 1;
      if (silentFramesRef.current > 8) {
        setFreq(0);
        setNote("—");
        setCents(0);
        setMicStatus("no_signal");
      }
      rafRef.current = requestAnimationFrame(detectPitch);
      return;
    }

    silentFramesRef.current = 0;
    setMicStatus("listening");

    const detected = detectPitchHz(buf, ctx.sampleRate);
    if (detected > 0) {
      setFreq(Math.round(detected * 10) / 10);
      const { note: n, cents: c } = freqToNote(detected, a4RefRef.current);
      setNote(n);
      setCents(c);
    }

    rafRef.current = requestAnimationFrame(detectPitch);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    setListening(false);
    setMicStatus("idle");
    setMicError("");
    setInputLevel(0);
    setFreq(0);
    setNote("—");
    setCents(0);
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("error");
      setMicError("当前浏览器不支持麦克风。请使用 Chrome、Safari 或 Edge，并通过 HTTPS 或 localhost 打开。");
      return;
    }

    setMicStatus("requesting");
    setMicError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      analyserRef.current = analyser;

      silentFramesRef.current = 0;
      setListening(true);
      setMicStatus("listening");
      detectPitch();
    } catch (err) {
      setListening(false);
      setMicStatus("error");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError("麦克风权限被拒绝。请在浏览器地址栏或系统设置中允许本网站使用麦克风，然后重试。");
      } else if (name === "NotFoundError") {
        setMicError("未找到麦克风设备。请连接麦克风或使用带麦克风的耳机。");
      } else {
        setMicError("无法启动麦克风，请检查设备与浏览器权限后重试。");
      }
    }
  };

  const stopRefTone = useCallback(() => {
    refToneRef.current?.stop();
    refToneRef.current = null;
    setPlayingRef(false);
  }, []);

  useEffect(() => () => {
    stop();
    stopRefTone();
  }, [stop, stopRefTone]);

  const toggleRefTone = async () => {
    if (playingRef) {
      stopRefTone();
      return;
    }
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    refToneRef.current = startReferenceTone(ctx, getReferenceFreq(refNote, a4Ref));
    setPlayingRef(true);
  };

  useEffect(() => {
    stopRefTone();
  }, [refNote, a4Ref, stopRefTone]);

  const needleRotation = Math.max(-45, Math.min(45, cents * 0.9));

  const statusMessage = (() => {
    if (micStatus === "requesting") return "正在请求麦克风权限…";
    if (micStatus === "error") return micError;
    if (micStatus === "no_signal") return "未检测到声音——请对着麦克风唱 Do、Re、Mi 或吹长笛。";
    if (micStatus === "listening" && freq > 0) return "已连接麦克风，正在识别音高。";
    if (micStatus === "listening") return "麦克风已连接，请发声。";
    return "点击「开始校音」连接麦克风，然后唱或演奏任意音。";
  })();

  return (
    <div className="cute-card p-6">
      <h3 className="text-lg font-semibold mb-1">校音器</h3>
      <p className="text-sm text-muted mb-5">
        连接麦克风后，唱 Do / Re / Mi 或吹奏，即可实时显示音名与偏差（依据所选 A 标准音高）
      </p>

      <div className="mb-5 p-4 bg-slate-50 rounded-lg border border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">A 标准音高</span>
          <span className="text-sm font-bold text-primary">{a4Ref} Hz</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {A4_REFERENCE_OPTIONS.map((hz) => (
            <button
              key={hz}
              onClick={() => setA4Ref(hz)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                a4Ref === hz
                  ? "bg-primary text-white"
                  : "bg-white border border-[var(--border)] text-muted hover:text-foreground"
              }`}
            >
              {hz}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2 leading-relaxed">{A4_REFERENCE_INFO[a4Ref]}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          各乐团实际音高会有差异，请以您的老师或所在乐团为准。
        </p>
      </div>

      <div
        className={`mb-4 p-3 rounded-lg border text-sm leading-relaxed flex gap-2 ${
          micStatus === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : listening
              ? "border-primary/30 bg-cyan-50 text-foreground"
              : "border-[var(--border)] bg-white text-muted"
        }`}
      >
        {micStatus === "error" ? (
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <Mic className={`w-4 h-4 shrink-0 mt-0.5 ${listening ? "text-primary" : ""}`} />
        )}
        <span>{statusMessage}</span>
      </div>

      {listening && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>输入音量</span>
            <span>{inputLevel > 5 ? "有信号" : "等待声音…"}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-75 rounded-full"
              style={{ width: `${inputLevel}%` }}
            />
          </div>
        </div>
      )}

      <div className="relative w-48 h-28 mx-auto mb-4">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-20 border-t-4 border-l-4 border-r-4 border-primary/30 rounded-t-full" />
        <div
          className="absolute bottom-0 left-1/2 w-1 h-20 bg-primary origin-bottom transition-transform duration-150"
          style={{ transform: `translateX(-50%) rotate(${needleRotation}deg)` }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary" />
      </div>

      <div className="text-center mb-2">
        <span className="text-4xl font-bold text-foreground">{note}</span>
        {freq > 0 && <span className="text-muted ml-2 text-sm">{freq} Hz</span>}
      </div>

      <div className="text-center mb-4 min-h-[1.25rem]">
        {cents !== 0 && freq > 0 && (
          <span className={`text-sm font-medium ${Math.abs(cents) < 10 ? "text-success" : "text-foreground"}`}>
            {cents > 0 ? `偏高 ${cents} 音分` : `偏低 ${Math.abs(cents)} 音分`}
            {Math.abs(cents) < 10 && " · 准确"}
          </span>
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-muted mb-1">参考音（播放标准音对照）</p>
        <p className="text-xs text-muted mb-2 leading-relaxed">
          选一个唱名，点击播放可持续发声对照（再点一次停止）。La 即上面所选 A 标准音高（{a4Ref} Hz）。
        </p>
        <div className="flex flex-wrap gap-2">
          {SOLFEGE_REFERENCE.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setRefNote(id)}
              className={`min-w-[2.75rem] px-3 py-1.5 rounded-md text-sm font-semibold ${
                refNote === id ? "bg-primary text-white" : "bg-slate-100 text-muted hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={listening ? stop : start}
          disabled={micStatus === "requesting"}
          className="cute-btn inline-flex items-center gap-2 flex-1 justify-center disabled:opacity-60"
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {micStatus === "requesting" ? "连接中…" : listening ? "停止" : "开始校音"}
        </button>
        <button
          onClick={toggleRefTone}
          className={`cute-btn inline-flex items-center gap-2 ${
            playingRef ? "bg-amber-500 hover:bg-amber-600 text-white" : "cute-btn-secondary"
          }`}
        >
          <Volume2 className="w-4 h-4" />
          {playingRef ? `停止 ${getSolfegeLabel(refNote)}` : `播放 ${getSolfegeLabel(refNote)}`}
        </button>
      </div>
    </div>
  );
}
