"""根据完整音频时长 + 整份谱面，推断本次演奏覆盖范围。"""

from backend.models.schemas import IssueItem, PerformanceAnalysisResult, SheetAnalysisResult
from backend.services.alignment import build_playback_scope
from backend.services.sheet_layout import performance_layout_notice
from backend.services.tempo_notation import TempoBeatUnit


def detect_analysis_scope(
    sheet: SheetAnalysisResult | None,
    performance: PerformanceAnalysisResult | None,
    tempo_beat_unit: TempoBeatUnit = "quarter",
) -> tuple[bool, str, str | None, list[IssueItem]]:
    """
    返回 (is_partial, section_label, alignment_notice, extra_issues)
    """
    extra: list[IssueItem] = []

    scope = build_playback_scope(sheet, performance, tempo_beat_unit)
    is_partial = scope["is_partial"]
    section_label = scope["section_label"]
    alignment_notice = scope["alignment_notice"]

    if performance and scope["duration_sec"] > 0:
        performance.played_measure_start = scope["played_start"]
        performance.played_measure_end = scope["played_end"]

    layout_notice = performance_layout_notice(sheet)
    if layout_notice and alignment_notice:
        alignment_notice = f"{layout_notice} {alignment_notice}"
    elif layout_notice:
        alignment_notice = layout_notice

    if sheet:
        sheet.is_partial = is_partial
        sheet.section_label = section_label

    duration = scope["duration_sec"]
    total_measures = scope["total_measures"]
    measures_played = scope["measures_played_est"]

    if sheet and performance and duration > 0 and total_measures:
        if measures_played > total_measures * 1.25:
            extra.append(
                IssueItem(
                    category="对齐提示",
                    severity="info",
                    message="演奏时长长于谱面总长度，可能包含重复段、休息或谱面未拍全",
                    suggestion="确认谱面 PDF/照片包含全曲，或检查录音是否有多余段落",
                )
            )
        elif measures_played < total_measures * 0.35 and total_measures >= 4:
            extra.append(
                IssueItem(
                    category="对齐提示",
                    severity="info",
                    message=f"本次录音约 {duration:.0f} 秒，未覆盖整首 {total_measures} 小节",
                    suggestion="这是正常的片段练习；评分只针对您实际吹到的部分",
                )
            )

    if (
        sheet
        and sheet.expected_notes
        and performance
        and performance.played_measure_start
        and performance.played_measure_start > 3
    ):
        start_m = scope["played_start"]
        extra.append(
            IssueItem(
                category="对齐提示",
                severity="info",
                message=f"检测到演奏可能从主谱第 {start_m} 小节附近开始，而非 Allegro 开头",
                suggestion="若确实从中间开始练习，当前评分范围已自动对齐到该段落",
            )
        )

    return is_partial, section_label, alignment_notice, extra
