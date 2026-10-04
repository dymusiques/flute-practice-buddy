"""节拍器对齐：检测录音中的咔哒声，判断演奏是否卡在正拍上。"""

from __future__ import annotations

import librosa
import numpy as np

from backend.services.score_location import ScorePositionResolver


def beat_period_sec(quarter_bpm: float) -> float:
    return 60.0 / max(25.0, float(quarter_bpm))


def extract_metronome_clicks(
    y,
    sr: int,
    *,
    beat_period: float,
    duration: float,
) -> np.ndarray:
    """
    从录音 percussive 分量提取节拍器咔哒时间点。
    若检测不足则返回空数组，由调用方回退到理论拍 grid。
    """
    if duration <= 0 or beat_period <= 0:
        return np.array([])

    _, y_perc = librosa.effects.hpss(y)
    hop = 512
    rms = librosa.feature.rms(y=y_perc, hop_length=hop)[0]
    if len(rms) < 4:
        return np.array([])

    min_gap_frames = max(1, int((beat_period * 0.55) * sr / hop))
    height = float(np.percentile(rms, 72))
    if height <= 0:
        return np.array([])

    from scipy.signal import find_peaks

    peaks, _ = find_peaks(rms, height=height, distance=min_gap_frames)
    if len(peaks) < 4:
        return np.array([])

    times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
    times = times[(times >= 0) & (times < duration - 0.05)]
    if len(times) < 4:
        return np.array([])

    ioi = np.diff(times)
    lo, hi = beat_period * 0.72, beat_period * 1.35
    good = (ioi > lo) & (ioi < hi)
    if int(np.sum(good)) < max(2, len(ioi) // 3):
        return np.array([])

    # 保留 IOI 接近 beat_period 的咔哒
    kept = [times[0]]
    for i, gap in enumerate(ioi):
        if lo < gap < hi:
            kept.append(times[i + 1])
    return np.array(kept) if len(kept) >= 4 else np.array([])


def build_beat_grid(
    duration: float,
    beat_period: float,
    click_times: np.ndarray | None = None,
) -> tuple[np.ndarray, float]:
    """返回拍点时间与校准后的 beat 间隔。"""
    if click_times is not None and len(click_times) >= 4:
        ioi = np.diff(click_times)
        ioi = ioi[(ioi > beat_period * 0.72) & (ioi < beat_period * 1.35)]
        if len(ioi):
            beat_period = float(np.median(ioi))
        grid = click_times
        if grid[0] > beat_period * 0.4:
            pre = np.arange(grid[0] - beat_period, 0, -beat_period)[::-1]
            grid = np.concatenate([pre, grid])
        tail = grid[-1] + beat_period
        while tail < duration:
            grid = np.append(grid, tail)
            tail += beat_period
        return grid, beat_period

    phase = 0.0
    return np.arange(phase, duration, beat_period), beat_period


def metronome_alignment_issues(
    note_times: list[float],
    *,
    beat_grid: np.ndarray,
    beat_period: float,
    position: ScorePositionResolver,
    align_tolerance: float = 0.14,
) -> list[tuple[float, float, str]]:
    """
    检查每个正拍附近是否有音与节拍器咔哒对齐。
    只评估「离拍点最近的那个演奏音」，忽略拍与拍之间的经过音。
    """
    if len(note_times) < 3 or len(beat_grid) < 3 or beat_period <= 0:
        return []

    tol = beat_period * align_tolerance
    segments: list[tuple[float, float, str]] = []

    for beat in beat_grid:
        nearby = [t for t in note_times if abs(t - beat) <= beat_period * 0.48]
        if not nearby:
            continue
        closest = min(nearby, key=lambda t: abs(t - beat))
        err = closest - beat
        if abs(err) <= tol:
            continue
        if err > 0:
            hint = "该拍上的音比节拍器晚，没卡准正拍"
        else:
            hint = "该拍上的音比节拍器早，抢拍"
        score = min(1.0, abs(err) / (beat_period * 0.32))
        segments.append((score, closest, hint))

    # 滑动窗口：连续多拍都没对齐 → 整段提示
    window_beats = 4
    for i in range(len(beat_grid) - window_beats):
        chunk = beat_grid[i : i + window_beats]
        misses = 0
        first_miss_ts = chunk[0]
        for beat in chunk:
            nearby = [t for t in note_times if abs(t - beat) <= beat_period * 0.48]
            if not nearby:
                continue
            closest = min(nearby, key=lambda t: abs(t - beat))
            if abs(closest - beat) > tol:
                misses += 1
                first_miss_ts = closest
        if misses >= 3:
            segments.append(
                (
                    0.65 + misses * 0.05,
                    first_miss_ts,
                    "连续多拍没和节拍器咔哒对齐",
                )
            )

    return segments


def detect_metronome_rhythm_issues(
    y,
    sr: int,
    *,
    duration: float,
    quarter_bpm: float,
    detected_sequence: list[tuple[str, float]],
    position: ScorePositionResolver,
) -> tuple[list[tuple[float, float, str]], float]:
    """主入口：返回 [(score, timestamp, hint), ...] 与 rhythm_stability。"""
    beat_period = beat_period_sec(quarter_bpm)
    clicks = extract_metronome_clicks(y, sr, beat_period=beat_period, duration=duration)
    grid, beat_period = build_beat_grid(duration, beat_period, clicks if len(clicks) else None)

    note_times = [ts for _, ts in detected_sequence if ts is not None]
    raw = metronome_alignment_issues(
        note_times,
        beat_grid=grid,
        beat_period=beat_period,
        position=position,
    )

    if not raw:
        return [], 0.75

    errors: list[float] = []
    for b in grid[: min(40, len(grid))]:
        nearby = [t for t in note_times if abs(t - b) <= beat_period * 0.48]
        if not nearby:
            continue
        closest = min(nearby, key=lambda t: abs(t - b))
        errors.append(abs(closest - b))
    if errors:
        mean_err = float(np.mean(errors))
        stability = max(0.0, min(1.0, 1.0 - mean_err / (beat_period * 0.35)))
    else:
        stability = 0.6

    return raw, stability
