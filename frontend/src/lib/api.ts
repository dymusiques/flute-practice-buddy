export interface IssueItem {
  category: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestion: string;
  timestamp_sec?: number | null;
  measure?: number | null;
  note_expected?: string | null;
  note_detected?: string | null;
}

export interface ScoreDeduction {
  id: string;
  category: string;
  dimension_key?: string | null;
  points: number;
  reason: string;
  location: string;
  suggestion: string;
  severity: "warning" | "error";
  measure?: number | null;
  staff_line?: number | null;
  timestamp_sec?: number | null;
  clip_url?: string | null;
  clip_start_sec?: number | null;
  clip_end_sec?: number | null;
}

export interface PracticeSegment {
  id: string;
  title: string;
  category: string;
  location: string;
  instruction: string;
  suggestion: string;
  start_measure?: number | null;
  end_measure?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  staff_line?: number | null;
  clip_url?: string | null;
  fixed: boolean;
  deduction_points: number;
}

export interface ScoreDimension {
  key: string;
  label: string;
  max_points: number;
  score: number;
  deducted: number;
  available: boolean;
  unavailable_reason?: string | null;
}

export interface ScoreBreakdown {
  base_score: number;
  deductions: ScoreDeduction[];
  total_deducted: number;
  bonus_points: number;
  overall: number;
  grade: string;
  summary: string;
  encouragement: string;
  stars: number;
  is_partial: boolean;
  section_label: string;
  alignment_notice?: string | null;
  practice_segments: PracticeSegment[];
  dimensions?: ScoreDimension[];
  posture_available?: boolean;
  pitch_accuracy: number;
  note_correctness: number;
  rhythm_accuracy: number;
  tempo_consistency: number;
  tone_quality: number;
  posture: number;
}

export interface SheetAnalysisResult {
  title: string;
  key_signature: string;
  time_signature: string;
  tempo_bpm: number | null;
  expected_notes: string[];
  articulation_markings: string[];
  issues: IssueItem[];
  ai_mode: "vision" | "mock";
  is_partial?: boolean;
  section_label?: string;
  measure_range?: string | null;
}

export interface PerformanceAnalysisResult {
  issues: IssueItem[];
  detected_tempo_bpm: number | null;
  pitch_stability: number | null;
  rhythm_stability: number | null;
  tone_score: number | null;
  posture_notes: string[];
  ai_mode: "audio" | "video" | "mock";
}

export interface FullAnalysisResult {
  session_id: string;
  parent_session_id?: string | null;
  attempt_number: number;
  sheet: SheetAnalysisResult | null;
  performance: PerformanceAnalysisResult | null;
  scores: ScoreBreakdown;
  coaching_text: string;
  voice_audio_url: string | null;
  sheet_media_url?: string | null;
  sheet_preview_url?: string | null;
  sheet_filename?: string | null;
  performance_audio_url?: string | null;
  performance_filename?: string | null;
  score_improved?: boolean | null;
  score_delta?: number | null;
  tempo_beat_unit?: "half" | "quarter" | "eighth";
  scoring_dimensions?: string[];
}

export interface AnalyzeOptions {
  parentSessionId?: string;
  targetTempo?: number;
  tempoBeatUnit?: "half" | "quarter" | "eighth" | "auto";
  /** 用户填写的录音速度数字（节拍类型与 tempoBeatUnit / 谱面识谱一致） */
  performanceTempo?: number;
  scoringDimensions?: string[];
  performanceType?: string;
}

export async function analyzePractice(
  sheetFile: File | null,
  performanceFile: File | null,
  options: AnalyzeOptions = {}
): Promise<FullAnalysisResult> {
  const formData = new FormData();
  if (sheetFile) formData.append("sheet_image", sheetFile);
  if (performanceFile) formData.append("performance_file", performanceFile);
  formData.append("performance_type", options.performanceType ?? "audio");
  if (options.targetTempo) formData.append("target_bpm", String(options.targetTempo));
  formData.append("tempo_beat_unit", options.tempoBeatUnit ?? "auto");
  if (options.performanceTempo != null) {
    formData.append("performance_bpm", String(options.performanceTempo));
  }
  if (options.scoringDimensions?.length) {
    formData.append("scoring_dimensions", JSON.stringify(options.scoringDimensions));
  }
  if (options.parentSessionId) formData.append("parent_session_id", options.parentSessionId);

  const res = await fetch("/api/analyze", { method: "POST", body: formData });
  if (!res.ok) {
    let detail = "分析失败，请稍后重试";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      if (res.status >= 500) {
        detail = "后端服务未响应（请确认 8000 端口 FastAPI 已启动）";
      }
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function rescoreSession(
  sessionId: string,
  scoringDimensions: string[]
): Promise<FullAnalysisResult> {
  const res = await fetch("/api/rescore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      scoring_dimensions: scoringDimensions,
    }),
  });
  if (!res.ok) {
    let detail = "重新评分失败，请稍后重试";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function markSegmentFixed(
  sessionId: string,
  segmentId: string
): Promise<{ segment_id: string; fixed: boolean; all_fixed: boolean; bonus_points: number }> {
  const res = await fetch("/api/mark-segment-fixed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, segment_id: segmentId }),
  });
  if (!res.ok) throw new Error("标记失败");
  return res.json();
}

export async function askFollowUp(
  sessionId: string,
  question: string,
  contextIssue?: string
): Promise<{ answer: string; voice_audio_url: string | null }> {
  const res = await fetch("/api/follow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, question, context_issue: contextIssue }),
  });
  if (!res.ok) throw new Error("追问失败");
  return res.json();
}

export async function checkHealth(): Promise<{
  status: string;
  google_configured: boolean;
  google_model: string | null;
  google_tts_enabled: boolean;
  google_tts_model: string | null;
}> {
  const res = await fetch("/api/health");
  return res.json();
}
