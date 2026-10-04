"""从演奏录音中截取错误片段，供前端回放。"""

import uuid
from pathlib import Path

import soundfile as sf

from backend.models.schemas import IssueItem, PracticeSegment, ScoreDeduction
from backend.services.media_loader import load_audio

DEFAULT_PAD_BEFORE = 1.0
DEFAULT_PAD_AFTER = 2.0


def _clip_window(timestamp: float, duration: float, *, pad_before: float, pad_after: float) -> tuple[float, float]:
    start = max(0.0, timestamp - pad_before)
    end = min(duration, timestamp + pad_after)
    if end - start < 0.4:
        end = min(duration, start + 0.8)
    return start, end


def extract_audio_clip(
    source_path: Path,
    output_path: Path,
    start_sec: float,
    end_sec: float,
) -> bool:
    try:
        y, sr = load_audio(source_path)
        duration = len(y) / sr
        start = max(0.0, min(start_sec, duration))
        end = max(start + 0.3, min(end_sec, duration))
        segment = y[int(start * sr) : int(end * sr)]
        if len(segment) < int(0.2 * sr):
            return False
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), segment, sr, subtype="PCM_16")
        return True
    except Exception:
        return False


def attach_clips_to_issues(
    source_path: Path,
    issues: list[IssueItem],
    upload_dir: Path,
    session_id: str,
) -> None:
    if not source_path.exists():
        return

    try:
        y, sr = load_audio(source_path)
        total_duration = len(y) / sr
    except Exception:
        return

    clip_idx = 0
    for issue in issues:
        if issue.severity not in ("warning", "error"):
            continue
        if issue.timestamp_sec is None:
            continue

        pad_before = DEFAULT_PAD_BEFORE
        pad_after = 1.8 if issue.category in ("音名对错", "音正确性", "音准") else DEFAULT_PAD_AFTER
        start, end = _clip_window(
            issue.timestamp_sec,
            total_duration,
            pad_before=pad_before,
            pad_after=pad_after,
        )

        clip_name = f"{session_id}_clip_{clip_idx}_{uuid.uuid4().hex[:6]}.wav"
        dest = upload_dir / clip_name
        if extract_audio_clip(source_path, dest, start, end):
            issue.clip_url = f"/media/{clip_name}"
            issue.clip_start_sec = round(start, 2)
            issue.clip_end_sec = round(end, 2)
            clip_idx += 1


def sync_clips_to_deductions(
    issues: list[IssueItem],
    deductions: list[ScoreDeduction],
) -> None:
    """把 issue 上的 clip_url 同步到扣分明细（按时间戳 + 类别匹配）。"""
    clip_by_key = {
        (round(i.timestamp_sec or 0, 1), i.category): i
        for i in issues
        if i.clip_url and i.timestamp_sec is not None
    }
    for d in deductions:
        if d.clip_url:
            continue
        issue = clip_by_key.get((round(d.timestamp_sec or 0, 1), d.category))
        if issue:
            d.clip_url = issue.clip_url
            d.clip_start_sec = issue.clip_start_sec
            d.clip_end_sec = issue.clip_end_sec


def copy_clip_fields_to_deduction(issue: IssueItem, deduction: ScoreDeduction) -> None:
    deduction.staff_line = issue.staff_line
    deduction.clip_url = issue.clip_url
    deduction.clip_start_sec = issue.clip_start_sec
    deduction.clip_end_sec = issue.clip_end_sec
