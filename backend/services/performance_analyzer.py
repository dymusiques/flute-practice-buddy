from pathlib import Path

import librosa
import numpy as np

from backend.models.schemas import IssueItem, PerformanceAnalysisResult, SheetAnalysisResult
from backend.services.alignment import (
    estimate_playing_quarter_bpm,
    find_best_note_offset_prefer_start,
    measure_from_note_index,
    measures_from_duration,
    notes_match,
    parse_beats_per_measure,
)
from backend.services.score_location import ScorePosition, ScorePositionResolver
from backend.services.metronome_align import detect_metronome_rhythm_issues
from backend.services.sheet_layout import (
    performance_coordinate_origin,
    performance_measure_count,
    performance_note_bounds,
    performance_position_from_exp_index,
)
from backend.services.tempo_notation import (
    TempoBeatUnit,
    format_tempo_mark,
    quarter_bpm_to_tempo,
    tempo_to_quarter_bpm,
)
from backend.services.media_loader import load_audio

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAX_NOTE_CORRECTNESS_ISSUES = 30
MAX_RHYTHM_ISSUES = 45
MAX_PITCH_ISSUES = 20


def _issue_location_key(pos: ScorePosition, timestamp_sec: float, *, bucket_sec: float = 6.0) -> tuple:
    """同一小节可有多条问题，按时间桶区分。"""
    bucket = int(timestamp_sec // bucket_sec) if timestamp_sec is not None else 0
    return (pos.staff_line, pos.measure_in_line, bucket)

AUDIO_SUFFIXES = {
    ".wav", ".mp3", ".m4a", ".aac", ".caf", ".aiff", ".aif",
    ".flac", ".ogg", ".oga", ".amr", ".3gp", ".webm",
}
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".webm", ".mkv", ".3gp"}


def _hz_to_note(hz: float) -> str:
    if hz <= 0 or np.isnan(hz):
        return "?"
    midi = int(round(69 + 12 * np.log2(hz / 440.0)))
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _merge_onset_times(times: list[float], min_gap: float) -> list[float]:
    if not times:
        return []
    merged = [times[0]]
    for t in times[1:]:
        if t - merged[-1] >= min_gap:
            merged.append(t)
    return merged


def _extract_detected_notes(
    y,
    sr: int,
    f0,
    voiced_flag,
    duration: float,
    *,
    min_onset_gap: float = 0.18,
) -> list[tuple[str, float]]:
    """按 onset 切分整段音频，提取每个音的音高与时间戳（合并过密 onset，减少节拍器咔哒）。"""
    hop_length = 512
    if f0 is None or voiced_flag is None:
        return []

    y_harm, _ = librosa.effects.hpss(y)
    onset_frames = librosa.onset.onset_detect(
        y=y_harm, sr=sr, units="frames", hop_length=hop_length, backtrack=True, delta=0.07
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length).tolist()
    onset_times = _merge_onset_times(onset_times, min_onset_gap)
    if not onset_times:
        onset_times = [0.0]
    if onset_times[-1] < duration * 0.95:
        onset_times.append(duration)

    detected: list[tuple[str, float]] = []
    for i, start in enumerate(onset_times):
        end = onset_times[i + 1] if i + 1 < len(onset_times) else duration
        if end - start < 0.05:
            continue
        start_frame = librosa.time_to_frames(start, sr=sr, hop_length=hop_length)
        end_frame = min(librosa.time_to_frames(end, sr=sr, hop_length=hop_length), len(f0))
        segment = f0[start_frame:end_frame]
        voiced = voiced_flag[start_frame:end_frame]
        if len(segment) == 0:
            continue
        valid = segment[voiced] if len(voiced) == len(segment) else segment
        valid = valid[~np.isnan(valid)] if len(valid) else np.array([])
        if len(valid) == 0:
            continue
        note = _hz_to_note(float(np.median(valid)))
        if note != "?":
            detected.append((note, start))

    if len(detected) < 3:
        step = max(1, len(f0) // max(int(duration * 2), 1))
        for frame_idx in range(0, len(f0), step):
            if frame_idx >= len(voiced_flag) or not voiced_flag[frame_idx]:
                continue
            hz = f0[frame_idx]
            if hz is None or np.isnan(hz):
                continue
            ts = librosa.frames_to_time(frame_idx, sr=sr, hop_length=hop_length)
            note = _hz_to_note(float(hz))
            if note != "?":
                detected.append((note, float(ts)))

    return detected


def _detect_rhythm_issues(
    y,
    sr: int,
    *,
    position: ScorePositionResolver,
    duration: float,
    quarter_bpm: float,
    detected_sequence: list[tuple[str, float]] | None = None,
) -> tuple[list[IssueItem], float]:
    """对照录音里的节拍器咔哒，检查正拍上的音有没有对齐。"""
    if not detected_sequence or len(detected_sequence) < 3:
        return [], 0.5

    raw_segments, rhythm_stability = detect_metronome_rhythm_issues(
        y,
        sr,
        duration=duration,
        quarter_bpm=quarter_bpm,
        detected_sequence=detected_sequence,
        position=position,
    )

    segments: list[tuple[float, float, int, str]] = [
        (score, ts, position.resolve(ts).global_measure, hint)
        for score, ts, hint in raw_segments
    ]
    segments.sort(key=lambda x: -x[0])
    issues: list[IssueItem] = []
    seen: set[tuple] = set()

    for score, ts_mid, _m, hint in segments:
        if score < 0.06:
            continue
        pos = position.resolve(ts_mid)
        key = (_issue_location_key(pos, ts_mid, bucket_sec=4.0), hint)
        if key in seen:
            continue
        seen.add(key)
        issues.append(
            IssueItem(
                category="节奏",
                severity="error" if score > 0.28 else "warning",
                message=f"{position.format_location(ts_mid)}{hint}",
                suggestion="听录音里节拍器的咔哒声，该落在正拍上的音要和咔哒对齐再吹",
                timestamp_sec=round(ts_mid, 1),
                measure=pos.global_measure,
                staff_line=pos.staff_line,
                measure_in_line=pos.measure_in_line,
            )
        )
        if len(issues) >= MAX_RHYTHM_ISSUES:
            break

    if not raw_segments and len(issues) == 0:
        rhythm_stability = max(rhythm_stability, 0.7)
    problem_ratio = min(1.0, len(issues) / 12.0)
    rhythm_stability = max(
        0.0,
        min(1.0, rhythm_stability * (1.0 - problem_ratio * 0.25)),
    )

    return issues, rhythm_stability


def _detect_pitch_issues(
    f0,
    voiced_flag,
    sr: int,
    *,
    position: ScorePositionResolver,
    duration: float,
) -> tuple[list[IssueItem], float]:
    """滑动窗口检测音高不稳定片段。"""
    hop_length = 512
    if f0 is None or voiced_flag is None:
        return [], 0.5

    voiced_f0 = f0[voiced_flag] if voiced_flag is not None else np.array([])
    pitch_stability = (
        float(np.std(voiced_f0) / np.mean(voiced_f0)) if len(voiced_f0) > 10 else 0.5
    )
    pitch_stability = max(0.0, min(1.0, 1.0 - pitch_stability * 3))

    window = 3.0
    step = 1.0

    segments: list[tuple[float, float, int]] = []
    win_start = 0.0
    while win_start + window * 0.4 < duration:
        win_end = min(duration, win_start + window)
        start_f = librosa.time_to_frames(win_start, sr=sr, hop_length=hop_length)
        end_f = min(librosa.time_to_frames(win_end, sr=sr, hop_length=hop_length), len(f0))
        seg = f0[start_f:end_f]
        v = voiced_flag[start_f:end_f] if voiced_flag is not None else None
        if v is not None and len(v) == len(seg):
            seg = seg[v]
        seg = seg[~np.isnan(seg)] if len(seg) else np.array([])
        if len(seg) > 15 and np.mean(seg) > 0:
            instability = float(np.std(seg) / np.mean(seg))
            if instability > 0.015:
                ts_mid = (win_start + win_end) / 2
                m = position.resolve(ts_mid).global_measure
                segments.append((instability, ts_mid, m))
        win_start += step

    segments.sort(key=lambda x: -x[0])
    issues: list[IssueItem] = []
    seen: set[tuple] = set()

    for instab, ts_mid, _m in segments:
        pos = position.resolve(ts_mid)
        key = _issue_location_key(pos, ts_mid, bucket_sec=6.0)
        if key in seen:
            continue
        seen.add(key)
        issues.append(
            IssueItem(
                category="音准",
                severity="warning",
                message=f"{position.format_location(ts_mid)}音高不够稳定",
                suggestion="打开校音器，慢速练习每个音，确保口型稳定后再加速",
                timestamp_sec=round(ts_mid, 1),
                measure=pos.global_measure,
                staff_line=pos.staff_line,
                measure_in_line=pos.measure_in_line,
            )
        )
        if len(issues) >= MAX_PITCH_ISSUES:
            break

    if not issues and pitch_stability < 0.6:
        ts = duration * 0.4
        pos = position.resolve(ts)
        issues.append(
            IssueItem(
                category="音准",
                severity="warning",
                message=f"{position.format_location(ts)}音高不够稳定",
                suggestion="打开校音器，慢速练习每个音，确保口型稳定后再加速",
                timestamp_sec=round(ts, 1),
                measure=pos.global_measure,
                staff_line=pos.staff_line,
                measure_in_line=pos.measure_in_line,
            )
        )

    return issues, pitch_stability


def _analyze_audio(
    audio_path: Path,
    sheet: SheetAnalysisResult | None,
    target_tempo: int | None,
    tempo_beat_unit: TempoBeatUnit = "quarter",
    performance_tempo: int | None = None,
) -> PerformanceAnalysisResult:
    issues: list[IssueItem] = []
    y, sr = load_audio(audio_path)
    duration = len(y) / sr

    # 谱面标记速度（♩=120 等）；无识谱结果时不臆造 120
    sheet_display_tempo = target_tempo or (sheet.tempo_bpm if sheet else None)

    # 实际演奏速度：仅用于与谱面速度对比，不参与小节定位
    if performance_tempo:
        playing_quarter_bpm = float(tempo_to_quarter_bpm(performance_tempo, tempo_beat_unit))
    else:
        playing_quarter_bpm = estimate_playing_quarter_bpm(y, sr) or 90.0
    min_onset_gap = 0.15
    playback_start_measure = 1
    beats_per_measure = parse_beats_per_measure(sheet.time_signature if sheet else "4/4")
    playback_end_measure = sheet.total_measures if sheet and sheet.total_measures else None

    f0, voiced_flag, _ = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C4"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
    )

    detected_sequence = _extract_detected_notes(
        y, sr, f0, voiced_flag, duration, min_onset_gap=min_onset_gap
    )
    if len(detected_sequence) >= 3:
        ioi = np.diff([ts for _, ts in detected_sequence])
        ioi = ioi[(ioi > 0.05) & (ioi < 3.0)]
        if len(ioi):
            min_onset_gap = max(0.1, float(np.median(ioi)) * 0.35)

    detected_notes = [n for n, _ in detected_sequence]
    note_offset = 0
    perf_origin = performance_coordinate_origin(sheet)

    if sheet and sheet.expected_notes and detected_notes:
        perf_base, perf_end_idx = performance_note_bounds(sheet)
        performance_expected = sheet.expected_notes[perf_base:perf_end_idx]
        local_offset, _match_count = find_best_note_offset_prefer_start(
            detected_notes, performance_expected
        )
        note_offset = perf_base + local_offset
        end_idx = min(len(sheet.expected_notes), note_offset + max(len(detected_notes), 1))
        playback_start_measure, _, _ = performance_position_from_exp_index(
            sheet, note_offset, origin=perf_origin
        )
        end_m_idx = max(note_offset, end_idx - 1)
        playback_end_measure, _, _ = performance_position_from_exp_index(
            sheet, end_m_idx, origin=perf_origin
        )

    est_measures = max(
        8,
        int(round(measures_from_duration(duration, playing_quarter_bpm, beats_per_measure))),
    )
    duration_end_measure = playback_start_measure + est_measures - 1
    if playback_end_measure is None or playback_end_measure <= playback_start_measure:
        playback_end_measure = duration_end_measure
    else:
        playback_end_measure = max(playback_end_measure, duration_end_measure)

    perf_total = performance_measure_count(sheet) if sheet else None
    if perf_total:
        playback_end_measure = min(playback_end_measure, perf_total)

    position = ScorePositionResolver(
        sheet,
        note_offset=note_offset,
        detected_sequence=detected_sequence,
        duration_sec=duration,
        playback_start_measure=playback_start_measure,
        playback_end_measure=playback_end_measure,
        performance_origin=perf_origin,
    )

    if sheet and sheet.expected_notes and detected_notes:
        compare_len = min(len(detected_notes), len(sheet.expected_notes) - note_offset)
        error_count = 0
        for idx in range(compare_len):
            det, ts = detected_sequence[idx]
            exp = sheet.expected_notes[note_offset + idx]
            if not notes_match(det, exp):
                error_count += 1
                pos = position.resolve_for_note_index(note_offset + idx)
                issues.append(
                    IssueItem(
                        category="音名对错",
                        severity="error",
                        message=(
                            f"{position.format_location(ts)}与谱面不符"
                            f"（吹成 {det}，应为 {exp}）"
                        ),
                        suggestion="对照谱面逐音练习，确认每个孔位和指法",
                        timestamp_sec=round(ts, 1),
                        measure=pos.global_measure,
                        staff_line=pos.staff_line,
                        measure_in_line=pos.measure_in_line,
                        note_expected=exp,
                        note_detected=det,
                    )
                )
                if error_count >= MAX_NOTE_CORRECTNESS_ISSUES:
                    break
    elif sheet and not sheet.expected_notes:
        issues.append(
            IssueItem(
                category="识谱",
                severity="warning",
                message="谱面识谱未完成，暂无法检查「有没有吹错音」",
                suggestion="请确认 Google API 配额正常，或换更清晰的 PDF 后重新分析",
                timestamp_sec=0.0,
                measure=1,
                staff_line=1,
                measure_in_line=1,
            )
        )

    pitch_issues, pitch_stability = _detect_pitch_issues(
        f0,
        voiced_flag,
        sr,
        position=position,
        duration=duration,
    )
    issues.extend(pitch_issues)

    rhythm_issues, rhythm_stability = _detect_rhythm_issues(
        y,
        sr,
        position=position,
        duration=duration,
        quarter_bpm=playing_quarter_bpm,
        detected_sequence=detected_sequence,
    )
    issues.extend(rhythm_issues)

    playing_display = quarter_bpm_to_tempo(playing_quarter_bpm, tempo_beat_unit)
    detected_bpm = playing_quarter_bpm

    if sheet_display_tempo:
        sheet_mark = format_tempo_mark(sheet_display_tempo, tempo_beat_unit)
        playing_mark = format_tempo_mark(playing_display, tempo_beat_unit)
        diff = abs(playing_display - sheet_display_tempo)
        if diff > 8:
            direction = "偏快" if playing_display > sheet_display_tempo else "偏慢"
            issues.append(
                IssueItem(
                    category="节拍器",
                    severity="error" if diff > 15 else "warning",
                    message=(
                        f"整体速度{direction}：谱面 {sheet_mark}，"
                        f"录音检测 {playing_mark}（相差 {diff:.0f}）"
                    ),
                    suggestion=f"把节拍器调到 {sheet_mark}，跟着慢练三遍",
                    timestamp_sec=0.0,
                    measure=1,
                    staff_line=1,
                )
            )
    rms = librosa.feature.rms(y=y)[0]
    rms_var = float(np.std(rms) / (np.mean(rms) + 1e-6))
    tone_score = max(40.0, min(95.0, 90.0 - rms_var * 30))

    if tone_score < 70:
        ts = duration * 0.6
        pos = position.resolve(ts)
        issues.append(
            IssueItem(
                category="音质",
                severity="warning",
                message=f"{position.format_location(ts)}气声偏多或用力不均",
                suggestion="想象吹蜡烛：气息稳定、均匀，不要过度用力",
                timestamp_sec=round(ts, 1),
                measure=pos.global_measure,
                staff_line=pos.staff_line,
                measure_in_line=pos.measure_in_line,
            )
        )

    return PerformanceAnalysisResult(
        issues=issues,
        duration_sec=round(duration, 2),
        detected_tempo_bpm=detected_bpm,
        pitch_stability=pitch_stability,
        rhythm_stability=rhythm_stability,
        tone_score=tone_score,
        detected_note_count=len(detected_notes),
        note_alignment_offset=note_offset,
        played_measure_start=playback_start_measure,
        played_measure_end=playback_end_measure,
        posture_notes=[],
        ai_mode="audio",
    )


def _analyze_video_placeholder() -> PerformanceAnalysisResult:
    return PerformanceAnalysisResult(
        issues=[
            IssueItem(
                category="姿势",
                severity="warning",
                message="检测到持笛角度可能偏低",
                suggestion="保持笛身与地面平行，不要向下倾斜",
                timestamp_sec=0.0,
                measure=1,
                staff_line=1,
            )
        ],
        posture_notes=["请检查持笛角度是否水平", "观察是否有耸肩", "检查左右手是否平衡"],
        ai_mode="video",
    )


async def analyze_performance(
    file_path: Path,
    media_type: str,
    sheet: SheetAnalysisResult | None,
    target_tempo: int | None,
    tempo_beat_unit: TempoBeatUnit = "quarter",
    performance_bpm: int | None = None,
) -> PerformanceAnalysisResult:
    suffix = file_path.suffix.lower()

    if suffix in VIDEO_SUFFIXES or media_type == "video":
        audio_result = None
        try:
            audio_result = _analyze_audio(
                file_path,
                sheet,
                target_tempo,
                tempo_beat_unit,
                performance_bpm,
            )
        except Exception:
            audio_result = None

        video_result = _analyze_video_placeholder()
        if audio_result:
            video_result.issues = audio_result.issues + video_result.issues
            video_result.duration_sec = audio_result.duration_sec
            video_result.detected_tempo_bpm = audio_result.detected_tempo_bpm
            video_result.pitch_stability = audio_result.pitch_stability
            video_result.rhythm_stability = audio_result.rhythm_stability
            video_result.tone_score = audio_result.tone_score
            video_result.detected_note_count = audio_result.detected_note_count
            video_result.note_alignment_offset = audio_result.note_alignment_offset
            video_result.played_measure_start = audio_result.played_measure_start
            video_result.played_measure_end = audio_result.played_measure_end
        return video_result

    if media_type == "audio" or suffix in AUDIO_SUFFIXES:
        try:
            return _analyze_audio(
                file_path,
                sheet,
                target_tempo,
                tempo_beat_unit,
                performance_bpm,
            )
        except Exception:
            pass

    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic"}:
        return PerformanceAnalysisResult(
            issues=[
                IssueItem(
                    category="姿势",
                    severity="info",
                    message="已收到演奏照片，姿势分析需视频录制",
                    suggestion="上传短视频以便分析持笛姿势",
                )
            ],
            ai_mode="mock",
        )

    return PerformanceAnalysisResult(
        issues=[
            IssueItem(
                category="上传",
                severity="error",
                message="无法读取演奏文件，请换 MP3、M4A 或 MP4 格式重试",
                suggestion="iPhone 录音可直接上传 M4A",
            )
        ],
        ai_mode="mock",
    )
