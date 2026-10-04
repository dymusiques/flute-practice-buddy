import uuid

from backend.models.schemas import (
    IssueItem,
    PerformanceAnalysisResult,
    PracticeSegment,
    ScoreBreakdown,
    ScoreDeduction,
    ScoreDimension,
    SheetAnalysisResult,
)
from backend.services.score_location import format_score_location

# 维度配置：key → (中文名, 满分)
DIMENSIONS: dict[str, tuple[str, float]] = {
    "rhythm_accuracy": ("节奏", 30.0),
    "tone_quality": ("音质", 25.0),
    "note_correctness": ("音名对错", 20.0),
    "pitch_accuracy": ("音准", 15.0),
    "posture": ("姿势", 10.0),
}

# (category_keywords, error扣分, warning扣分, 维度 key)
DEDUCTION_RULES: list[tuple[list[str], float, float, str]] = [
    (["节奏"], 6.0, 3.0, "rhythm_accuracy"),
    (["音质", "气声"], 4.0, 2.0, "tone_quality"),
    (["音名对错", "音正确", "音正确性", "吹错"], 4.0, 2.0, "note_correctness"),
    (["音准", "音高"], 3.0, 1.5, "pitch_accuracy"),
    (["姿势"], 2.0, 1.0, "posture"),
]

CATEGORY_DIM_MAP = {
    "节奏": "rhythm_accuracy",
    "音质": "tone_quality",
    "气声": "tone_quality",
    "音名对错": "note_correctness",
    "音正确": "note_correctness",
    "音正确性": "note_correctness",
    "吹错": "note_correctness",
    "音准": "pitch_accuracy",
    "音高": "pitch_accuracy",
    "姿势": "posture",
}


def _match_rule(category: str) -> tuple[float, float, str]:
    for keywords, err_pts, warn_pts, dim_key in DEDUCTION_RULES:
        if any(kw in category for kw in keywords):
            return err_pts, warn_pts, dim_key
    return 2.0, 1.0, "pitch_accuracy"


def _dim_key_for_category(category: str) -> str | None:
    if any(kw in category for kw in ("节拍", "速度", "节拍器")):
        return None
    for kw, dim in CATEGORY_DIM_MAP.items():
        if kw in category:
            return dim
    return "pitch_accuracy"


def _location_label(issue: IssueItem) -> str:
    loc = format_score_location(
        issue.measure,
        issue.timestamp_sec,
        staff_line=issue.staff_line,
        measure_in_line=issue.measure_in_line,
    )
    if issue.note_expected:
        return f"{loc} · 应吹 {issue.note_expected}"
    return loc


def _grade_from_percent(pct: float) -> tuple[str, str, int]:
    if pct >= 100:
        return "满分大师 🏆", "太厉害了！你是长笛小明星！每一个音都吹得棒棒的！", 3
    if pct >= 90:
        return "优秀 ⭐", "非常棒！再练一点点就能拿满分啦！", 3
    if pct >= 80:
        return "良好 👍", "进步很大！看看下面的小提示，继续加油！", 2
    if pct >= 70:
        return "合格 ✅", "不错哦！有几个地方练一练就会更好！", 2
    if pct >= 60:
        return "需努力 💪", "别灰心！跟着提示一段一段练，一定可以的！", 1
    return "继续加油 🌱", "每一次练习都是进步！慢慢来，老师会陪着你！", 1


def _build_practice_segment(deduction: ScoreDeduction) -> PracticeSegment:
    return PracticeSegment(
        id=deduction.id,
        title=f"{deduction.category} · 需要改进",
        category=deduction.category,
        location=deduction.location,
        instruction=deduction.reason,
        suggestion=deduction.suggestion,
        start_measure=deduction.measure,
        end_measure=(deduction.measure + 1) if deduction.measure else None,
        start_sec=deduction.timestamp_sec,
        end_sec=deduction.clip_end_sec or (
            (deduction.timestamp_sec + 4.0) if deduction.timestamp_sec else None
        ),
        staff_line=deduction.staff_line,
        clip_url=deduction.clip_url,
        deduction_points=deduction.points,
    )


DEFAULT_SCORING_DIMENSIONS = [
    "rhythm_accuracy",
    "tone_quality",
    "note_correctness",
    "pitch_accuracy",
]


def _normalize_scoring_dimensions(
    scoring_dimensions: list[str] | None,
    posture_available: bool,
) -> set[str]:
    if not scoring_dimensions:
        keys = set(DEFAULT_SCORING_DIMENSIONS)
    else:
        keys = {k for k in scoring_dimensions if k in DIMENSIONS}
        if not keys:
            keys = set(DEFAULT_SCORING_DIMENSIONS)
    if not posture_available:
        keys.discard("posture")
    return keys


def _selected_labels(selected: set[str]) -> str:
    return "·".join(DIMENSIONS[k][0] for k in DIMENSIONS if k in selected)


def compute_scores(
    sheet: SheetAnalysisResult | None,
    performance: PerformanceAnalysisResult | None,
    is_partial: bool = False,
    section_label: str = "完整曲目",
    alignment_notice: str | None = None,
    posture_available: bool = False,
    scoring_dimensions: list[str] | None = None,
) -> ScoreBreakdown:
    selected_dims = _normalize_scoring_dimensions(scoring_dimensions, posture_available)
    note_correctness_available = bool(sheet and sheet.expected_notes)
    if not note_correctness_available:
        selected_dims.discard("note_correctness")
    all_issues: list[IssueItem] = []
    if sheet:
        all_issues.extend(sheet.issues)
    if performance:
        all_issues.extend(performance.issues)

    scorable = [i for i in all_issues if i.severity in ("warning", "error")]

    dim_deducted: dict[str, float] = {k: 0.0 for k in DIMENSIONS}
    dim_scores: dict[str, float] = {k: cap for k, (_, cap) in DIMENSIONS.items()}

    deductions: list[ScoreDeduction] = []

    for issue in scorable:
        dim_key = _dim_key_for_category(issue.category)
        if not dim_key or dim_key not in DIMENSIONS:
            continue
        if dim_key == "posture" and not posture_available:
            continue

        err_pts, warn_pts, _ = _match_rule(issue.category)
        points = err_pts if issue.severity == "error" else warn_pts

        if is_partial:
            points = round(points * 0.85, 1)

        cap = DIMENSIONS[dim_key][1]
        remaining = cap - dim_deducted[dim_key]
        actual_points = min(points, max(0.0, remaining))

        dim_deducted[dim_key] += actual_points
        dim_scores[dim_key] = max(0.0, round(cap - dim_deducted[dim_key], 1))

        # 维度扣满后仍保留明细（0 分），便于展示整段录音中的全部问题
        deductions.append(
            ScoreDeduction(
                id=uuid.uuid4().hex[:8],
                category=issue.category,
                dimension_key=dim_key,
                points=actual_points,
                reason=issue.message,
                location=_location_label(issue),
                suggestion=issue.suggestion,
                severity=issue.severity,
                measure=issue.measure,
                staff_line=issue.staff_line,
                measure_in_line=issue.measure_in_line,
                timestamp_sec=issue.timestamp_sec,
                clip_url=issue.clip_url,
                clip_start_sec=issue.clip_start_sec,
                clip_end_sec=issue.clip_end_sec,
            )
        )

    if performance:
        if performance.pitch_stability is not None:
            signal = round(performance.pitch_stability * 15, 1)
            dim_scores["pitch_accuracy"] = min(dim_scores["pitch_accuracy"], signal)
        if performance.rhythm_stability is not None:
            signal = round(performance.rhythm_stability * 30, 1)
            dim_scores["rhythm_accuracy"] = min(dim_scores["rhythm_accuracy"], signal)
        if performance.tone_score is not None:
            signal = round(max(0.0, min(25.0, (performance.tone_score / 100.0) * 25)), 1)
            dim_scores["tone_quality"] = min(dim_scores["tone_quality"], signal)

    dimension_rows: list[ScoreDimension] = []
    for key, (label, cap) in DIMENSIONS.items():
        if key == "posture" and not posture_available:
            dimension_rows.append(
                ScoreDimension(
                    key=key,
                    label=label,
                    max_points=cap,
                    score=0.0,
                    deducted=0.0,
                    available=False,
                    unavailable_reason="需视频或图片",
                )
            )
            dim_scores[key] = 0.0
            continue

        if key == "note_correctness" and not note_correctness_available:
            dimension_rows.append(
                ScoreDimension(
                    key=key,
                    label=label,
                    max_points=cap,
                    score=0.0,
                    deducted=0.0,
                    available=False,
                    unavailable_reason="谱面识谱未完成，无法对比音名对错",
                )
            )
            dim_scores[key] = 0.0
            continue

        score = dim_scores[key]
        dimension_rows.append(
            ScoreDimension(
                key=key,
                label=label,
                max_points=cap,
                score=score,
                deducted=round(cap - score, 1),
                available=True,
            )
        )

    selected_max = sum(DIMENSIONS[k][1] for k in selected_dims)
    selected_total = sum(dim_scores[k] for k in selected_dims)
    selected_pct = (selected_total / selected_max * 100) if selected_max else 0

    total_deducted = round(sum(dim_deducted[k] for k in selected_dims), 1)
    overall = round(selected_total, 1)
    grade, encouragement, stars = _grade_from_percent(selected_pct)

    visible_deductions = [d for d in deductions if d.dimension_key in selected_dims]
    practice_segments = [_build_practice_segment(d) for d in visible_deductions]

    summary_parts: list[str] = []
    if is_partial:
        summary_parts.append(f"本次为「{section_label}」片段评分。")
    summary_parts.append(
        f"已选项目（{_selected_labels(selected_dims)}）得分 {overall}/{selected_max}。"
    )
    if selected_pct >= 100:
        summary_parts.append("所选项目零失误！")
    elif selected_pct >= 85:
        summary_parts.append(f"整体不错，共扣 {total_deducted} 分。")
    elif selected_pct >= 70:
        summary_parts.append(f"有 {len(deductions)} 处可改进。")
    else:
        summary_parts.append(f"建议分段慢练，共发现 {len(deductions)} 个问题。")

    return ScoreBreakdown(
        base_score=100.0,
        deductions=deductions,
        total_deducted=total_deducted,
        bonus_points=0.0,
        overall=overall,
        grade=grade,
        summary=" ".join(summary_parts),
        encouragement=encouragement,
        stars=stars,
        is_partial=is_partial,
        section_label=section_label,
        alignment_notice=alignment_notice,
        practice_segments=practice_segments,
        dimensions=dimension_rows,
        posture_available=posture_available,
        pitch_accuracy=round(dim_scores["pitch_accuracy"], 1),
        note_correctness=round(dim_scores["note_correctness"], 1),
        rhythm_accuracy=round(dim_scores["rhythm_accuracy"], 1),
        tempo_consistency=0.0,
        tone_quality=round(dim_scores["tone_quality"], 1),
        posture=round(dim_scores["posture"], 1),
    )
