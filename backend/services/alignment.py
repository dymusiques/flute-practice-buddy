"""谱面全长 vs 演奏时长：估算覆盖了哪一段、从哪一小节开始对齐。"""

import re

import librosa
import numpy as np

from backend.models.schemas import PerformanceAnalysisResult, SheetAnalysisResult
from backend.services.sheet_layout import performance_coordinate_origin, performance_measure_count
from backend.services.tempo_notation import TempoBeatUnit, tempo_to_quarter_bpm


def parse_beats_per_measure(time_signature: str | None) -> int:
    if not time_signature:
        return 4
    match = re.search(r"(\d+)\s*/\s*(\d+)", time_signature)
    if match:
        return max(1, int(match.group(1)))
    return 4


def note_pitch_class(note: str) -> str:
    n = (note or "?").strip().upper()
    if not n or n == "?":
        return "?"
    base = re.match(r"([A-G])([#B]?)?", n)
    if base:
        letter = base.group(1)
        acc = base.group(2) or ""
        if acc == "B":
            return letter + "b"
        return letter + acc
    return n[:2]


def notes_match(detected: str, expected: str) -> bool:
    return note_pitch_class(detected) == note_pitch_class(expected)


def measures_from_duration(
    duration_sec: float,
    bpm: float | int | None,
    beats_per_measure: int,
) -> float:
    if duration_sec <= 0:
        return 0.0
    tempo = float(bpm) if bpm and bpm > 0 else 88.0
    sec_per_measure = (60.0 / tempo) * beats_per_measure
    return duration_sec / sec_per_measure


def count_note_matches(detected: list[str], expected: list[str], offset: int) -> int:
    matches = 0
    for i, det in enumerate(detected):
        j = offset + i
        if j >= len(expected):
            break
        if notes_match(det, expected[j]):
            matches += 1
    return matches


def find_best_note_offset(detected: list[str], expected: list[str]) -> tuple[int, int]:
    """在 expected 中滑动匹配 detected，返回 (起始索引, 匹配音数)。"""
    if not detected or not expected:
        return 0, 0

    best_offset = 0
    best_matches = 0
    for offset in range(len(expected)):
        matches = count_note_matches(detected, expected, offset)
        if matches > best_matches:
            best_matches = matches
            best_offset = offset

    return best_offset, best_matches


def find_best_note_offset_prefer_start(
    detected: list[str],
    expected: list[str],
    *,
    start_bias: float = 0.72,
) -> tuple[int, int]:
    """
    滑动匹配，但倾向从 expected 开头对齐（主谱第 1 小节起吹时避免误跳到中间）。
    """
    if not detected or not expected:
        return 0, 0

    best_offset, best_matches = find_best_note_offset(detected, expected)
    start_matches = count_note_matches(detected, expected, 0)
    if start_matches >= max(3, int(best_matches * start_bias)):
        return 0, start_matches
    return best_offset, best_matches


def measure_from_note_index(
    note_index: int,
    total_notes: int,
    total_measures: int | None,
) -> int:
    if total_measures and total_notes > 0:
        return max(1, min(total_measures, int(note_index / total_notes * total_measures) + 1))
    return max(1, note_index // 4 + 1)


def _quarter_bpm_candidates(raw_bpm: float) -> list[float]:
    """librosa 常检出倍频/分频，展开为可能的四分音符 BPM。"""
    if raw_bpm <= 0:
        return []
    out: list[float] = []
    for mult in (1, 0.5, 1 / 3, 0.25, 2 / 3, 3 / 4, 1.5, 2, 3 / 2):
        val = raw_bpm * mult
        if 45 <= val <= 180:
            out.append(val)
    return out or [raw_bpm]


def estimate_playing_quarter_bpm(y, sr: int) -> float | None:
    """
    从整段录音估计实际演奏的四分音符 BPM（窗口化 beat_track，避免误检倍频）。
    """
    duration = len(y) / sr if sr else 0.0
    if duration < 3:
        return None

    y_harm, _ = librosa.effects.hpss(y)
    collected: list[float] = []
    win = min(25.0, duration)
    step = max(5.0, win / 2)
    t = 0.0
    while t + 5 < duration:
        for signal in (y, y_harm):
            seg = signal[int(t * sr) : int(min(t + win, duration) * sr)]
            if len(seg) < sr * 5:
                continue
            raw, _ = librosa.beat.beat_track(y=seg, sr=sr)
            raw_val = float(np.atleast_1d(raw)[0])
            collected.extend(_quarter_bpm_candidates(raw_val))
        t += step

    if not collected:
        raw, _ = librosa.beat.beat_track(y=y, sr=sr)
        collected.extend(_quarter_bpm_candidates(float(np.atleast_1d(raw)[0])))

    # 长笛练习常见速度带；优先取 75–105 内的估计（避免 136 这类倍频）
    band = [b for b in collected if 75 <= b <= 105]
    if len(band) >= 3:
        return round(float(np.median(band)))
    plausible = [b for b in collected if 60 <= b <= 130]
    if plausible:
        return round(float(np.median(plausible)))
    return round(float(np.median(collected))) if collected else None


def normalize_detected_tempo(detected_bpm: float | None, reference_bpm: float | None) -> float | None:
    """将 librosa 原始估速折叠为四分音符 BPM；有谱面速度时优先落在合理演奏区间。"""
    if not detected_bpm:
        return None
    candidates = _quarter_bpm_candidates(detected_bpm)
    if not reference_bpm or reference_bpm <= 0:
        band = [c for c in candidates if 75 <= c <= 105]
        if band:
            return float(np.median(band))
        return float(np.median(candidates)) if candidates else detected_bpm
    # 有谱面速度：在合理解里选最接近谱面的，避免单纯选最近倍频
    plausible = [c for c in candidates if 0.55 * reference_bpm <= c <= 1.45 * reference_bpm]
    pool = plausible or candidates
    return min(pool, key=lambda x: abs(x - reference_bpm))


def measure_from_timestamp(
    timestamp_sec: float,
    reference_bpm: float | int | None,
    beats_per_measure: int,
    start_measure: int = 1,
) -> int:
    """按谱面速度把录音时间点换算为小节（不用 librosa 估速）。"""
    if not reference_bpm or reference_bpm <= 0:
        return max(1, start_measure + int(timestamp_sec // 2))
    sec_per_measure = (60.0 / float(reference_bpm)) * beats_per_measure
    return max(1, start_measure + int(timestamp_sec / sec_per_measure))


def build_playback_scope(
    sheet: SheetAnalysisResult | None,
    performance: PerformanceAnalysisResult | None,
    tempo_beat_unit: TempoBeatUnit = "quarter",
) -> dict:
    """
    根据整首谱面 + 完整音频时长，推断本次演奏覆盖的小节范围。
    不要求从第 1 小节起吹——会用音高序列在谱面中滑动对齐。
    """
    result = {
        "duration_sec": 0.0,
        "total_measures": None,
        "measures_played_est": 0.0,
        "played_start": 1,
        "played_end": 1,
        "note_offset": 0,
        "is_partial": False,
        "section_label": "完整曲目",
        "alignment_notice": None,
    }

    if not performance or not performance.duration_sec:
        return result

    duration = float(performance.duration_sec)
    result["duration_sec"] = duration

    sheet_tempo = sheet.tempo_bpm if sheet else None
    if sheet_tempo:
        reference_bpm = tempo_to_quarter_bpm(sheet_tempo, tempo_beat_unit)
    else:
        reference_bpm = performance.detected_tempo_bpm or 88
    beats = parse_beats_per_measure(sheet.time_signature if sheet else "4/4")
    measures_played = measures_from_duration(duration, reference_bpm, beats)
    result["measures_played_est"] = round(measures_played, 1)

    total_measures = sheet.total_measures if sheet else None
    if sheet and sheet.expected_notes and total_measures is None:
        total_measures = max(1, len(sheet.expected_notes) // beats)

    perf_total = performance_measure_count(sheet) or total_measures
    result["total_measures"] = perf_total

    if performance.played_measure_start is not None:
        result["played_start"] = max(1, int(performance.played_measure_start))
    if performance.played_measure_end is not None:
        result["played_end"] = max(result["played_start"], int(performance.played_measure_end))

    note_offset = performance.note_alignment_offset or 0
    result["note_offset"] = note_offset

    end_by_duration = max(1, int(round(measures_played)) or 1)
    if result["played_end"] <= result["played_start"] and sheet and sheet.expected_notes:
        origin = performance_coordinate_origin(sheet)
        from backend.services.sheet_layout import performance_position_from_exp_index

        start_m, _, _ = performance_position_from_exp_index(sheet, note_offset, origin=origin)
        end_idx = min(len(sheet.expected_notes), note_offset + max(performance.detected_note_count or 0, 1))
        end_m, _, _ = performance_position_from_exp_index(sheet, max(note_offset, end_idx - 1), origin=origin)
        result["played_start"] = start_m
        result["played_end"] = min(max(start_m, end_m), start_m + end_by_duration - 1)
        if perf_total:
            result["played_end"] = min(result["played_end"], perf_total)
    elif result["played_end"] <= result["played_start"]:
        result["played_end"] = max(1, int(round(measures_played)) or 1)

    if perf_total:
        coverage = measures_played / perf_total if perf_total else 0
        ps, pe = result["played_start"], result["played_end"]
        mins, secs = divmod(int(duration), 60)
        if coverage >= 0.85 and ps <= 1:
            result["section_label"] = f"主谱完整（约 {perf_total} 小节）"
            result["is_partial"] = False
            result["alignment_notice"] = (
                f"录音全长 {mins} 分 {secs} 秒（{duration:.0f} 秒）；主谱共约 {perf_total} 小节，"
                f"已按主谱第 1 小节起算。"
            )
        else:
            result["is_partial"] = True
            if ps == pe:
                result["section_label"] = f"主谱第 {ps} 小节附近"
            else:
                result["section_label"] = f"主谱第 {ps}–{pe} 小节"
            result["alignment_notice"] = (
                f"录音全长 {mins} 分 {secs} 秒（{duration:.0f} 秒）；主谱共约 {perf_total} 小节。"
                f"本次覆盖 {result['section_label']}（小节号均相对 Allegro 主谱，从 1 起算）。"
            )
    else:
        pe = result["played_end"]
        result["section_label"] = f"约 {pe} 小节（按音频时长估算）"
        result["is_partial"] = measures_played < 8
        result["alignment_notice"] = (
            f"音频全长约 {duration:.0f} 秒，已按完整录音分析；"
            f"若谱面比录音更长，评分仅覆盖您吹到的段落。"
        )

    return result
