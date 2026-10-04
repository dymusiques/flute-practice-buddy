"""谱面位置：依据识谱扫描结果定位，不依赖实际演奏速度。"""

from __future__ import annotations

import bisect
from dataclasses import dataclass

from backend.models.schemas import SheetAnalysisResult
from backend.services.alignment import measure_from_note_index
from backend.services.sheet_layout import (
    PerformanceCoordinateOrigin,
    performance_coordinate_origin,
    performance_position_from_exp_index,
)

DEFAULT_MEASURES_PER_SYSTEM = 4


@dataclass(frozen=True)
class ScorePosition:
    global_measure: int
    staff_line: int
    measure_in_line: int


def measure_to_staff_position(
    global_measure: int,
    measures_per_system: int = DEFAULT_MEASURES_PER_SYSTEM,
) -> tuple[int, int]:
    """全局小节号 → (谱面第几行, 该行内第几小节)，均从 1 起算。"""
    gm = max(1, int(global_measure))
    mps = max(1, measures_per_system)
    staff_line = (gm - 1) // mps + 1
    measure_in_line = (gm - 1) % mps + 1
    return staff_line, measure_in_line


def format_timestamp(timestamp_sec: float | None) -> str:
    if timestamp_sec is None:
        return ""
    m = int(timestamp_sec // 60)
    s = int(timestamp_sec % 60)
    return f"{m}:{s:02d}"


def format_score_location(
    global_measure: int | None,
    timestamp_sec: float | None = None,
    *,
    staff_line: int | None = None,
    measure_in_line: int | None = None,
    measures_per_system: int = DEFAULT_MEASURES_PER_SYSTEM,
) -> str:
    """例：第 2 行第 3 小节（录音 0:41）"""
    if staff_line is not None and measure_in_line is not None:
        loc = f"第 {staff_line} 行第 {measure_in_line} 小节"
    elif global_measure is not None:
        sl, mil = measure_to_staff_position(global_measure, measures_per_system)
        loc = f"第 {sl} 行第 {mil} 小节"
    elif timestamp_sec is not None:
        return f"录音 {format_timestamp(timestamp_sec)}"
    else:
        return "演奏中"
    if timestamp_sec is not None:
        loc += f"（录音 {format_timestamp(timestamp_sec)}）"
    return loc


class ScorePositionResolver:
    """
    将录音时间点映射到谱面行/小节。
    优先：识谱 note 索引 + 音高对齐；其次：录音进度在谱面小节范围内的比例。
    不使用实际演奏 BPM。
    """

    def __init__(
        self,
        sheet: SheetAnalysisResult | None,
        *,
        note_offset: int = 0,
        detected_sequence: list[tuple[str, float]] | None = None,
        duration_sec: float = 0.0,
        playback_start_measure: int = 1,
        playback_end_measure: int | None = None,
        performance_origin: PerformanceCoordinateOrigin | None = None,
    ):
        self.sheet = sheet
        self.note_offset = note_offset
        self.detected_sequence = detected_sequence or []
        self.duration_sec = max(0.0, duration_sec)
        self.playback_start = max(1, playback_start_measure)
        self.playback_end = playback_end_measure
        self.origin = performance_origin or performance_coordinate_origin(sheet)
        self.measures_per_system = DEFAULT_MEASURES_PER_SYSTEM
        if sheet and sheet.measures_per_system and sheet.measures_per_system > 0:
            self.measures_per_system = int(sheet.measures_per_system)

        self._timeline: list[tuple[float, ScorePosition]] = []
        self._build_timeline()

    def _position_for_exp_index(self, exp_idx: int) -> ScorePosition:
        if self.sheet and self.sheet.expected_notes:
            gm, sl, mil = performance_position_from_exp_index(
                self.sheet, exp_idx, origin=self.origin
            )
            return ScorePosition(gm, sl, mil)
        gm = max(1, exp_idx // 4 + 1)
        sl, mil = measure_to_staff_position(gm, self.measures_per_system)
        return ScorePosition(gm, sl, mil)

    def _playback_span(self) -> int:
        end = self.playback_end
        if end is None and self.sheet and self.sheet.total_measures:
            end = int(self.sheet.total_measures)
        if end is None or end < self.playback_start:
            end = max(self.playback_start, self.playback_start + 7)
        return max(1, end - self.playback_start + 1)

    def _position_for_progress(self, progress: float) -> ScorePosition:
        progress = max(0.0, min(1.0, progress))
        span = self._playback_span()
        global_measure = self.playback_start + int(progress * max(0, span - 1))
        if self.playback_end is not None:
            global_measure = max(self.playback_start, min(self.playback_end, global_measure))
        sl, mil = measure_to_staff_position(global_measure, self.measures_per_system)
        return ScorePosition(global_measure, sl, mil)

    def _build_timeline(self) -> None:
        if not self.detected_sequence:
            return

        if self.sheet and self.sheet.expected_notes:
            for i, (_, ts) in enumerate(self.detected_sequence):
                exp_idx = self.note_offset + i
                if exp_idx >= len(self.sheet.expected_notes):
                    if self.duration_sec > 0:
                        progress = float(ts) / self.duration_sec
                    elif len(self.detected_sequence) > 1:
                        progress = i / (len(self.detected_sequence) - 1)
                    else:
                        progress = 0.0
                    pos = self._position_for_progress(progress)
                else:
                    pos = self._position_for_exp_index(exp_idx)
                self._timeline.append((float(ts), pos))
            return

        # 识谱失败时：按录音时间 + 演奏覆盖小节范围，把检测到的音映射到谱面行/小节
        n = len(self.detected_sequence)
        for i, (_, ts) in enumerate(self.detected_sequence):
            if self.duration_sec > 0:
                progress = float(ts) / self.duration_sec
            elif n > 1:
                progress = i / (n - 1)
            else:
                progress = 0.0
            self._timeline.append((float(ts), self._position_for_progress(progress)))

    def _nearest_timeline(self, timestamp_sec: float) -> ScorePosition:
        times = [t for t, _ in self._timeline]
        idx = bisect.bisect_left(times, timestamp_sec)
        if idx <= 0:
            return self._timeline[0][1]
        if idx >= len(times):
            return self._timeline[-1][1]
        before = self._timeline[idx - 1]
        after = self._timeline[idx]
        if timestamp_sec - before[0] <= after[0] - timestamp_sec:
            return before[1]
        return after[1]

    def _fallback_progress(self, timestamp_sec: float) -> ScorePosition:
        if self.duration_sec > 0:
            progress = max(0.0, min(1.0, timestamp_sec / self.duration_sec))
        else:
            progress = 0.0
        return self._position_for_progress(progress)

    def resolve(self, timestamp_sec: float) -> ScorePosition:
        if self._timeline:
            return self._nearest_timeline(timestamp_sec)
        return self._fallback_progress(timestamp_sec)

    def resolve_for_note_index(self, exp_idx: int) -> ScorePosition:
        return self._position_for_exp_index(exp_idx)

    def format_location(self, timestamp_sec: float) -> str:
        pos = self.resolve(timestamp_sec)
        return format_score_location(
            pos.global_measure,
            timestamp_sec,
            staff_line=pos.staff_line,
            measure_in_line=pos.measure_in_line,
        )

    def fill_issue(self, issue, timestamp_sec: float):
        pos = self.resolve(timestamp_sec)
        issue.measure = pos.global_measure
        issue.staff_line = pos.staff_line
        issue.measure_in_line = pos.measure_in_line
        return issue
