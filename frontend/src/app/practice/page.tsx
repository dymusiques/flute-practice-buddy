"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";
import UploadZone from "@/components/UploadZone";
import ScoreBoard from "@/components/ScoreBoard";
import DeductionList from "@/components/DeductionList";
import PracticeFlow from "@/components/PracticeFlow";
import SearchButtons from "@/components/SearchButtons";
import { analyzePractice, rescoreSession, type FullAnalysisResult } from "@/lib/api";
import {
  detectPerformanceType,
  PERF_ACCEPT,
  PERF_EXTENSIONS,
  PERF_FORMATS_LABEL,
  SHEET_ACCEPT,
  SHEET_EXTENSIONS,
  SHEET_FORMATS_LABEL,
} from "@/lib/upload-formats";
import { checkSheetImageQuality } from "@/lib/sheet-image-quality";
import type { TempoBeatUnit } from "@/lib/tempo-notation";
import TempoBeatUnitPicker from "@/components/TempoBeatUnitPicker";
import TempoMark from "@/components/TempoMark";
import RecordingTempoPicker from "@/components/RecordingTempoPicker";
import ScoreDimensionPicker from "@/components/ScoreDimensionPicker";
import SheetPreviewCard from "@/components/SheetPreviewCard";
import {
  checkedDimensionKeys,
  checkedFromKeys,
  defaultCheckedDimensions,
  dimensionScoresFromBreakdown,
  dimensionsEqual,
  hasActiveDimensionSelection,
} from "@/lib/score-dimensions";

type Step = "upload" | "analyzing" | "result";

export default function PracticePage() {
  const [step, setStep] = useState<Step>("upload");
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [perfFile, setPerfFile] = useState<File | null>(null);
  const [perfType, setPerfType] = useState<"audio" | "video">("audio");
  const [autoBeatUnit, setAutoBeatUnit] = useState(true);
  const [tempoBeatUnit, setTempoBeatUnit] = useState<TempoBeatUnit>("quarter");
  const [useRecordingTempo, setUseRecordingTempo] = useState(false);
  const [recordingTempo, setRecordingTempo] = useState(80);
  const [result, setResult] = useState<FullAnalysisResult | null>(null);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetQualityWarning, setSheetQualityWarning] = useState<string | null>(null);
  const [sheetQualityChecking, setSheetQualityChecking] = useState(false);
  const [parentSessionId, setParentSessionId] = useState<string | undefined>();
  const [scoreChecked, setScoreChecked] = useState(defaultCheckedDimensions);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState<string | null>(null);
  const rescoreSnapshot = useRef<string[] | null>(null);

  const postureAvailableForUpload = useMemo(
    () => perfType === "video" || Boolean(perfFile?.type.startsWith("image/")),
    [perfType, perfFile]
  );

  const postureAvailableForResult = useMemo(() => {
    if (result?.scores.posture_available != null) return result.scores.posture_available;
    return perfType === "video" || Boolean(perfFile?.type.startsWith("image/"));
  }, [result, perfType, perfFile]);

  const selectedDimensionKeys = useMemo(
    () => checkedDimensionKeys(scoreChecked, postureAvailableForResult),
    [scoreChecked, postureAvailableForResult]
  );

  const rescorePending = Boolean(
    step === "result" &&
      result &&
      !dimensionsEqual(selectedDimensionKeys, result.scoring_dimensions ?? []) &&
      hasActiveDimensionSelection(scoreChecked, postureAvailableForResult)
  );

  const analyzedDimensionKeys = result?.scoring_dimensions ?? [];
  const resultSessionId = result?.session_id;

  useEffect(() => {
    if (step !== "result" || !resultSessionId) return;
    if (!hasActiveDimensionSelection(scoreChecked, postureAvailableForResult)) return;

    const selected = checkedDimensionKeys(scoreChecked, postureAvailableForResult);
    if (dimensionsEqual(selected, analyzedDimensionKeys)) return;

    rescoreSnapshot.current = analyzedDimensionKeys;
    setRescoreError(null);
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setRescoring(true);
      try {
        const updated = await rescoreSession(resultSessionId, selected);
        if (cancelled) return;
        setResult(updated);
        setScoreChecked(checkedFromKeys(updated.scoring_dimensions));
        setLiveScore(updated.scores.overall);
        rescoreSnapshot.current = null;
      } catch (e) {
        if (cancelled) return;
        setRescoreError(e instanceof Error ? e.message : "重新评分失败");
        if (rescoreSnapshot.current) {
          setScoreChecked(checkedFromKeys(rescoreSnapshot.current));
        }
      } finally {
        if (!cancelled) setRescoring(false);
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    scoreChecked,
    step,
    resultSessionId,
    analyzedDimensionKeys,
    postureAvailableForResult,
  ]);

  const handleSheetFile = async (file: File | null) => {
    setSheetFile(file);
    setSheetQualityWarning(null);
    if (!file) return;

    setSheetQualityChecking(true);
    try {
      const result = await checkSheetImageQuality(file);
      if (!result.ok && result.message) {
        setSheetQualityWarning(result.message);
      }
    } finally {
      setSheetQualityChecking(false);
    }
  };

  const handleAnalyze = async () => {
    if (!sheetFile && !perfFile) {
      setError("请至少上传谱面或演奏文件");
      return;
    }
    if (sheetQualityWarning) {
      setError(sheetQualityWarning);
      return;
    }
    if (!hasActiveDimensionSelection(scoreChecked, postureAvailableForUpload)) {
      setError("请至少勾选一项可评分的项目");
      return;
    }
    setError(null);
    setStep("analyzing");
    const scoringDimensions = checkedDimensionKeys(scoreChecked, postureAvailableForUpload);
    try {
      const res = await analyzePractice(sheetFile, perfFile, {
        parentSessionId,
        tempoBeatUnit: autoBeatUnit ? "auto" : tempoBeatUnit,
        performanceTempo: useRecordingTempo ? recordingTempo : undefined,
        scoringDimensions,
        performanceType: perfType,
      });
      setResult(res);
      if (res.tempo_beat_unit) {
        setTempoBeatUnit(res.tempo_beat_unit);
      }
      setScoreChecked(checkedFromKeys(res.scoring_dimensions));
      setLiveScore(res.scores.overall);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败，请检查网络或稍后重试");
      setStep("upload");
    }
  };

  const handleReupload = () => {
    setParentSessionId(result?.session_id);
    setPerfFile(null);
    setStep("upload");
  };

  const handlePerfFile = (file: File | null) => {
    setPerfFile(file);
    if (file) setPerfType(detectPerformanceType(file));
  };

  const handleScoreUpdate = (overall: number, _bonus?: number) => {
    setLiveScore(overall);
    if (result) {
      setResult({
        ...result,
        scores: { ...result.scores, overall },
      });
    }
  };

  return (
    <div className="w-full">
      <div className="section-wrap py-12 border-b border-[var(--border)] mb-8">
        <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">练习与分析</p>
        <h1 className="page-title">上传作品，开始分析</h1>
        <p className="page-desc">
          随便拍谱面、随便录演奏都可以。系统会自动识别谱面范围，并与演奏对齐后再评分。
        </p>
      </div>
      <div className="section-wrap pb-16">

      {step === "upload" && (
        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          <aside className="cute-card p-6 h-fit lg:sticky lg:top-24 space-y-6">
            <div>
              <h3 className="font-semibold mb-4">分析流程</h3>
              <ol className="text-sm text-muted space-y-3">
                <li className="font-medium text-foreground">1. 上传谱面</li>
                <li className="font-medium text-foreground">2. 上传演奏</li>
                <li className="font-medium text-foreground">3. 选择评分项目</li>
                <li>4. 自动对齐 &amp; AI 分析</li>
                <li>5. 查看报告</li>
                <li>6. 针对性练习</li>
              </ol>
            </div>

            <div className="border-t border-[var(--border)] pt-5 space-y-3">
              <div>
                <p className="text-sm font-semibold">本次评分项目</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  分析前选好要评哪些项；结果页增删选项会自动重新评分。
                </p>
              </div>
              <ScoreDimensionPicker
                checked={scoreChecked}
                onChange={setScoreChecked}
                postureAvailable={postureAvailableForUpload}
                compact
              />
            </div>
          </aside>
        <div className="space-y-5">
          {parentSessionId && (
            <div className="cute-card p-4 bg-success/10 border-success/30 text-center">
              <p className="font-bold text-success">🔄 重新上传模式 — 看看进步了多少！</p>
            </div>
          )}

          <UploadZone
            label="📸 上传谱面"
            hint="拍谱子照片或 PDF 均可，完整曲目或一页/一小段都行，无需手动标注"
            accept={SHEET_ACCEPT}
            supportedFormats={SHEET_FORMATS_LABEL}
            allowedExtensions={SHEET_EXTENSIONS}
            icon="sheet"
            file={sheetFile}
            onFile={handleSheetFile}
          />

          {sheetQualityChecking && (
            <p className="text-sm text-muted text-center">正在检查谱面清晰度…</p>
          )}
          {sheetQualityWarning && (
            <div className="cute-card p-4 border-2 border-amber-300 bg-amber-50 text-amber-900">
              <p className="font-bold text-sm">⚠️ 谱面不够清晰</p>
              <p className="text-sm mt-1">{sheetQualityWarning}</p>
              <p className="text-xs mt-2 text-amber-800/80">
                请重新上传更清晰的谱面后再点「开始分析」。PDF 会在提交时由服务器再检查一遍。
              </p>
            </div>
          )}

          <UploadZone
            label="🎵 上传演奏（音频或视频）"
            hint="录下你的演奏，哪怕只有一小段也可以；上传 MP3 或 MP4 均可"
            accept={PERF_ACCEPT}
            supportedFormats={PERF_FORMATS_LABEL}
            allowedExtensions={[...PERF_EXTENSIONS]}
            icon={perfFile && perfType === "video" ? "video" : "audio"}
            file={perfFile}
            onFile={handlePerfFile}
          />

          <div className="cute-card p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">谱面速度标记</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                用于读懂谱面上的速度写法。若谱面写的是{" "}
                <TempoMark tempo={88} unit="quarter" numberClassName="text-xs font-semibold" noteSize={14} />{" "}
                或{" "}
                <TempoMark tempo={56} unit="eighth" numberClassName="text-xs font-semibold" noteSize={14} />，
                不懂音符类型的用户保持默认即可。
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoBeatUnit}
                onChange={(e) => setAutoBeatUnit(e.target.checked)}
                className="w-5 h-5 accent-primary"
              />
              <span className="text-sm font-medium">自动从谱面识别节拍类型</span>
            </label>

            {!autoBeatUnit && (
              <TempoBeatUnitPicker
                value={tempoBeatUnit}
                onChange={setTempoBeatUnit}
              />
            )}
          </div>

          <div className="cute-card p-4">
            <RecordingTempoPicker
              enabled={useRecordingTempo}
              onEnabledChange={setUseRecordingTempo}
              tempo={recordingTempo}
              onTempoChange={setRecordingTempo}
              beatUnit={tempoBeatUnit}
              beatUnitAuto={autoBeatUnit}
            />
          </div>

          {error && <p className="text-center text-red-500 font-bold">{error}</p>}

          <button
            onClick={handleAnalyze}
            disabled={Boolean(sheetQualityWarning) || sheetQualityChecking}
            className="cute-btn inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            开始分析
          </button>
        </div>
        </div>
      )}

      {step === "analyzing" && (
        <div className="cute-card p-12 text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="font-extrabold text-xl text-primary-dark">AI 小助手正在听...</p>
          <p className="text-muted mt-2">识别谱面、对齐演奏、分析音准与节奏中，请稍等 ⏳</p>
        </div>
      )}

      {step === "result" && result && (
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 items-start">
          <aside className="lg:sticky lg:top-24 space-y-4 flex flex-col">
            {(result.sheet_filename || result.sheet_media_url || result.sheet?.title) && (
              <SheetPreviewCard
                mediaUrl={result.sheet_media_url}
                previewUrl={result.sheet_preview_url}
                filename={result.sheet_filename}
                recognizedTitle={result.sheet?.title}
              />
            )}

            <ScoreBoard
              scores={result.scores}
              scoreDelta={result.score_delta}
              attemptNumber={result.attempt_number}
              postureAvailable={postureAvailableForResult}
              checked={scoreChecked}
              rescoring={rescoring}
            />

            <div className="cute-card p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">本次评分项目</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  增删选项后会自动重新评分，无需重新上传。
                </p>
              </div>
              <ScoreDimensionPicker
                checked={scoreChecked}
                onChange={setScoreChecked}
                postureAvailable={postureAvailableForResult}
                scores={dimensionScoresFromBreakdown(result.scores)}
                compact
              />
              {(rescoring || rescorePending) && (
                <p className="text-xs font-semibold text-primary bg-primary/10 rounded-lg px-3 py-2 text-center">
                  {rescoring ? "正在按新选项重新评分…" : "选项已变更，即将重新评分…"}
                </p>
              )}
              {rescoreError && (
                <p className="text-xs text-red-500 font-bold">{rescoreError}</p>
              )}
              {!hasActiveDimensionSelection(scoreChecked, postureAvailableForResult) && (
                <p className="text-xs text-amber-700 font-bold">请至少勾选一项评分项目</p>
              )}
            </div>
          </aside>
          <div className="space-y-6">
          <DeductionList
            deductions={result.scores.deductions}
            checked={scoreChecked}
            postureAvailable={postureAvailableForResult}
          />

          <PracticeFlow
            result={result}
            onReupload={handleReupload}
            onScoreUpdate={handleScoreUpdate}
          />

          {result.coaching_text && (
            <div className="cute-card p-6">
              <h3 className="text-xl font-extrabold mb-3">👩‍🏫 老师点评</h3>
              <p className="whitespace-pre-line text-foreground leading-relaxed">{result.coaching_text}</p>
              {result.voice_audio_url && (
                <audio controls src={result.voice_audio_url} className="mt-4 w-full" />
              )}
            </div>
          )}

          <SearchButtons query={`长笛 ${result.sheet?.title ?? ""} 练习方法`} />

          <button onClick={handleReupload} className="cute-btn inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            重新上传作品
          </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
