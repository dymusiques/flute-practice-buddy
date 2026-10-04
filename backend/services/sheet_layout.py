"""谱面排版：上小下大（预览行 + 主谱）等布局的处理。"""

from __future__ import annotations

from dataclasses import dataclass

from backend.models.schemas import SheetAnalysisResult


def _measure_to_staff_position(global_measure: int, measures_per_system: int) -> tuple[int, int]:
    gm = max(1, int(global_measure))
    mps = max(1, measures_per_system)
    staff_line = (gm - 1) // mps + 1
    measure_in_line = (gm - 1) % mps + 1
    return staff_line, measure_in_line


@dataclass(frozen=True)
class PerformanceCoordinateOrigin:
    """主谱（实际演奏段落）坐标原点：显示时减去该偏移，Allegro 第一小节 = 1。"""

    note_index: int = 0
    measure_base: int = 0
    staff_line_base: int = 0


def performance_note_bounds(sheet: SheetAnalysisResult | None) -> tuple[int, int]:
    """
    返回用于与录音对齐的 expected_notes 切片 [start, end)。
    若页面上方有较小预览谱、下方较大主谱，跳过预览段，从主谱起算。
    """
    if not sheet or not sheet.expected_notes:
        return 0, 0

    n = len(sheet.expected_notes)
    start = 0

    if sheet.preview_note_count and sheet.preview_note_count > 0:
        start = min(int(sheet.preview_note_count), n)
    elif sheet.performance_staff_start_line and sheet.performance_staff_start_line > 1:
        start = _index_at_staff_line(sheet, sheet.performance_staff_start_line)
    elif sheet.layout_type == "dual_preview_main":
        start = _infer_preview_cut(sheet)

    return min(start, n), n


def performance_coordinate_origin(sheet: SheetAnalysisResult | None) -> PerformanceCoordinateOrigin:
    """主谱第一小节、第一行在识谱原始编号中的起点。"""
    if not sheet:
        return PerformanceCoordinateOrigin()

    note_index, _ = performance_note_bounds(sheet)
    measure_base = 0
    staff_line_base = 0

    if note_index > 0:
        if sheet.note_measures and note_index < len(sheet.note_measures):
            measure_base = max(0, int(sheet.note_measures[note_index]) - 1)
        if sheet.note_staff_lines and note_index < len(sheet.note_staff_lines):
            staff_line_base = max(0, int(sheet.note_staff_lines[note_index]) - 1)
        elif sheet.performance_staff_start_line and sheet.performance_staff_start_line > 1:
            staff_line_base = int(sheet.performance_staff_start_line) - 1

    return PerformanceCoordinateOrigin(
        note_index=note_index,
        measure_base=measure_base,
        staff_line_base=staff_line_base,
    )


def has_performance_region(sheet: SheetAnalysisResult | None) -> bool:
    origin = performance_coordinate_origin(sheet)
    return origin.note_index > 0 or origin.measure_base > 0 or origin.staff_line_base > 0


def normalize_performance_measure(raw_measure: int, origin: PerformanceCoordinateOrigin) -> int:
    return max(1, int(raw_measure) - origin.measure_base)


def normalize_staff_line(raw_staff_line: int, origin: PerformanceCoordinateOrigin) -> int:
    return max(1, int(raw_staff_line) - origin.staff_line_base)


def performance_position_from_exp_index(
    sheet: SheetAnalysisResult,
    exp_idx: int,
    *,
    origin: PerformanceCoordinateOrigin | None = None,
) -> tuple[int, int, int]:
    """
    返回 (display_measure, display_staff_line, measure_in_line)，均相对主谱，从 1 起算。
    """
    if origin is None:
        origin = performance_coordinate_origin(sheet)

    mps = sheet.measures_per_system or 4

    raw_measure: int | None = None
    if sheet.note_measures and exp_idx < len(sheet.note_measures):
        raw_measure = int(sheet.note_measures[exp_idx])
    elif sheet.expected_notes and sheet.total_measures:
        from backend.services.alignment import measure_from_note_index

        raw_measure = measure_from_note_index(
            exp_idx, len(sheet.expected_notes), sheet.total_measures
        )

    if raw_measure is not None:
        display_measure = normalize_performance_measure(raw_measure, origin)
        staff_line, measure_in_line = _measure_to_staff_position(display_measure, mps)
        return display_measure, staff_line, measure_in_line

    if sheet.note_staff_lines and exp_idx < len(sheet.note_staff_lines):
        staff_line = normalize_staff_line(int(sheet.note_staff_lines[exp_idx]), origin)
        mil = 1
        if sheet.note_measure_in_line and exp_idx < len(sheet.note_measure_in_line):
            mil = max(1, int(sheet.note_measure_in_line[exp_idx]))
        display_measure = (staff_line - 1) * mps + mil
        return display_measure, staff_line, mil

    return 1, 1, 1


def performance_measure_count(sheet: SheetAnalysisResult | None) -> int | None:
    if not sheet or not sheet.total_measures:
        return None
    origin = performance_coordinate_origin(sheet)
    return max(1, int(sheet.total_measures) - origin.measure_base)


def _index_at_staff_line(sheet: SheetAnalysisResult, staff_line: int) -> int:
    if sheet.note_staff_lines:
        for i, sl in enumerate(sheet.note_staff_lines):
            if sl >= staff_line:
                return i
    return 0


def _infer_preview_cut(sheet: SheetAnalysisResult) -> int:
    """预览行通常只有 1 个系统、音较少；主谱从下一行开始。"""
    if not sheet.note_staff_lines:
        return 0

    lines = sheet.note_staff_lines
    preview_run = 0
    for sl in lines:
        if sl == 1:
            preview_run += 1
        else:
            break

    if preview_run <= 0:
        return 0

    if preview_run <= 24 and preview_run < len(lines) * 0.35:
        return preview_run

    return 0


def slice_expected_notes(sheet: SheetAnalysisResult) -> list[str]:
    start, end = performance_note_bounds(sheet)
    return sheet.expected_notes[start:end]


def slice_indexed_field(values: list[int] | None, start: int, end: int) -> list[int] | None:
    if not values:
        return None
    return values[start:end]


def performance_layout_notice(sheet: SheetAnalysisResult | None) -> str | None:
    if not sheet or not has_performance_region(sheet):
        return None
    return (
        "谱面第一页上方有较小预览谱；下方 Allegro 主谱的第 1 小节已作为「第 1 小节」计数，"
        "扣分明细中的行号/小节号均指主谱。"
    )
