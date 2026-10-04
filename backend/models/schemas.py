from typing import Literal

from pydantic import BaseModel, Field


class IssueItem(BaseModel):
    category: str
    severity: Literal["info", "warning", "error"] = "warning"
    message: str
    suggestion: str
    timestamp_sec: float | None = None
    measure: int | None = None
    staff_line: int | None = Field(default=None, description="谱面第几行（自上而下）")
    measure_in_line: int | None = Field(default=None, description="该行内第几小节（识谱布局）")
    note_expected: str | None = None
    note_detected: str | None = None
    clip_url: str | None = None
    clip_start_sec: float | None = None
    clip_end_sec: float | None = None


class ScoreDeduction(BaseModel):
    """单项扣分记录 — 对孩子/家长透明展示"""
    id: str
    category: str
    dimension_key: str | None = None
    points: float = Field(ge=0, le=100, description="扣掉的分值")
    reason: str
    location: str = Field(description="如：第3小节、0:15处")
    suggestion: str
    severity: Literal["warning", "error"] = "warning"
    measure: int | None = None
    staff_line: int | None = None
    measure_in_line: int | None = None
    timestamp_sec: float | None = None
    clip_url: str | None = None
    clip_start_sec: float | None = None
    clip_end_sec: float | None = None


class ScoreDimension(BaseModel):
    """单项评分维度（各自独立满分，仅勾选项参与汇总）"""

    key: str
    label: str
    max_points: float
    score: float = Field(description="该项得分（满分 max_points）")
    deducted: float = 0
    available: bool = True
    unavailable_reason: str | None = None


class PracticeSegment(BaseModel):
    """Duolingo 式分段练习单元 — 从错误处开始练"""
    id: str
    title: str
    category: str
    location: str
    instruction: str
    suggestion: str
    start_measure: int | None = None
    end_measure: int | None = None
    start_sec: float | None = None
    end_sec: float | None = None
    staff_line: int | None = None
    clip_url: str | None = None
    fixed: bool = False
    deduction_points: float = 0


class ScoreBreakdown(BaseModel):
    base_score: float = 100.0
    deductions: list[ScoreDeduction] = Field(default_factory=list)
    total_deducted: float = 0
    bonus_points: float = 0
    overall: float = Field(ge=0, le=100)
    grade: str
    summary: str
    encouragement: str
    stars: int = Field(ge=0, le=3)
    is_partial: bool = False
    section_label: str = "完整曲目"
    alignment_notice: str | None = Field(
        default=None,
        description="谱面与演奏自动对齐后的说明",
    )
    practice_segments: list[PracticeSegment] = Field(default_factory=list)
    dimensions: list[ScoreDimension] = Field(default_factory=list)
    posture_available: bool = False
    # 各项得分：节奏 0–30，音质 0–25，音名对错 0–20，音准 0–15，姿势 0–10
    pitch_accuracy: float = Field(ge=0, le=15)
    note_correctness: float = Field(ge=0, le=20)
    rhythm_accuracy: float = Field(ge=0, le=30)
    tempo_consistency: float = Field(default=0.0, ge=0, le=20, description="已停用，恒为 0")
    tone_quality: float = Field(ge=0, le=25)
    posture: float = Field(ge=0, le=10)


class SheetAnalysisResult(BaseModel):
    title: str = "未识别曲目"
    key_signature: str = "未知"
    time_signature: str = "4/4"
    tempo_bpm: int | None = None
    tempo_beat_unit: Literal["half", "quarter", "eighth"] | None = Field(
        default=None,
        description="谱面速度标记中，数字对应哪种音符为一拍",
    )
    total_measures: int | None = Field(
        default=None,
        description="谱面总小节数（整首或当前页可见的完整段落）",
    )
    measures_per_system: int | None = Field(
        default=None,
        description="谱面每一行（每个系统）包含的小节数，由识谱扫描得出",
    )
    note_measures: list[int] | None = Field(
        default=None,
        description="与 expected_notes 等长：每个音在谱面上的全局小节号",
    )
    note_staff_lines: list[int] | None = Field(
        default=None,
        description="与 expected_notes 等长：每个音所在谱面行号（自上而下）",
    )
    note_measure_in_line: list[int] | None = Field(
        default=None,
        description="与 expected_notes 等长：每个音在该行内是第几小节",
    )
    expected_notes: list[str] = Field(default_factory=list)
    articulation_markings: list[str] = Field(default_factory=list)
    issues: list[IssueItem] = Field(default_factory=list)
    ai_mode: Literal["vision", "mock"] = "mock"
    is_partial: bool = False
    section_label: str = "完整曲目"
    measure_range: str | None = Field(
        default=None,
        description="上传文件在谱面上可见的小节范围（非评分范围）",
    )
    layout_type: Literal["standard", "dual_preview_main"] | None = Field(
        default=None,
        description="standard=常规；dual_preview_main=页面上小下大（上方预览+下方主谱）",
    )
    preview_note_count: int | None = Field(
        default=None,
        description="预览谱在 expected_notes 中占用的音数，主谱从该索引之后开始",
    )
    performance_staff_start_line: int | None = Field(
        default=None,
        description="实际演奏主谱从第几行 staff 开始（自上而下，不含上方小谱预览行）",
    )


class PerformanceAnalysisResult(BaseModel):
    issues: list[IssueItem] = Field(default_factory=list)
    duration_sec: float | None = None
    detected_tempo_bpm: float | None = None
    pitch_stability: float | None = None
    rhythm_stability: float | None = None
    tone_score: float | None = None
    detected_note_count: int | None = None
    note_alignment_offset: int | None = Field(
        default=None,
        description="检测到的音高序列在谱面 expected_notes 中的最佳起始索引",
    )
    played_measure_start: int | None = None
    played_measure_end: int | None = None
    posture_notes: list[str] = Field(default_factory=list)
    ai_mode: Literal["audio", "video", "mock"] = "mock"


class FullAnalysisResult(BaseModel):
    session_id: str
    parent_session_id: str | None = None
    attempt_number: int = 1
    sheet: SheetAnalysisResult | None = None
    performance: PerformanceAnalysisResult | None = None
    scores: ScoreBreakdown
    coaching_text: str
    voice_audio_url: str | None = None
    sheet_media_url: str | None = None
    sheet_preview_url: str | None = Field(
        default=None,
        description="谱面预览图（PDF 第一页渲染为 PNG，避免 iframe 黑屏）",
    )
    sheet_filename: str | None = None
    performance_audio_url: str | None = None
    performance_filename: str | None = None
    score_improved: bool | None = None
    score_delta: float | None = None
    tempo_beat_unit: Literal["half", "quarter", "eighth"] = "quarter"
    scoring_dimensions: list[str] = Field(
        default_factory=lambda: [
            "rhythm_accuracy",
            "tone_quality",
            "note_correctness",
            "pitch_accuracy",
        ],
        description="本次分析勾选的评分维度",
    )


class FollowUpRequest(BaseModel):
    session_id: str
    question: str
    context_issue: str | None = None


class FollowUpResponse(BaseModel):
    answer: str
    voice_audio_url: str | None = None


class RescoreRequest(BaseModel):
    session_id: str
    scoring_dimensions: list[str]


class MarkSegmentFixedRequest(BaseModel):
    session_id: str
    segment_id: str


class MarkSegmentFixedResponse(BaseModel):
    segment_id: str
    fixed: bool
    all_fixed: bool
    bonus_points: float
