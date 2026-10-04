import json
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.services.google_ai import is_google_configured
from backend.models.schemas import (
    FollowUpRequest,
    FollowUpResponse,
    FullAnalysisResult,
    MarkSegmentFixedRequest,
    MarkSegmentFixedResponse,
    RescoreRequest,
)
from backend.services.ai_coach import answer_follow_up, build_coaching_text
from backend.services.audio_clips import attach_clips_to_issues, sync_clips_to_deductions
from backend.services.performance_analyzer import analyze_performance
from backend.services.scope_detector import detect_analysis_scope
from backend.services.scoring import DEFAULT_SCORING_DIMENSIONS, compute_scores
from backend.services.tempo_notation import resolve_tempo_beat_unit
from backend.services.sheet_analyzer import analyze_sheet_image
from backend.services.sheet_preview import render_sheet_preview
from backend.services.sheet_image_quality import check_sheet_file_quality
from backend.services.voice_service import synthesize_voice

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / settings.upload_dir
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="FluteBuddy API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

sessions: dict[str, FullAnalysisResult] = {}


def _save_upload(upload: UploadFile, session_id: str, label: str) -> Path:
    suffix = Path(upload.filename or "file.bin").suffix or ".bin"
    dest = UPLOAD_DIR / f"{session_id}_{label}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return dest


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "google_configured": is_google_configured(),
        "google_model": settings.google_model if is_google_configured() else None,
        "google_tts_enabled": settings.google_tts_enabled and is_google_configured(),
        "google_tts_model": settings.google_tts_model if is_google_configured() else None,
    }


@app.post("/api/analyze", response_model=FullAnalysisResult)
async def analyze_practice(
    sheet_image: UploadFile | None = File(None),
    performance_file: UploadFile | None = File(None),
    performance_type: str = Form("audio"),
    target_bpm: int | None = Form(None),
    performance_bpm: int | None = Form(None),
    tempo_beat_unit: str = Form("auto"),
    scoring_dimensions: str | None = Form(None),
    parent_session_id: str | None = Form(None),
):
    session_id = uuid.uuid4().hex[:12]
    attempt_number = 1
    score_improved: bool | None = None
    score_delta: float | None = None

    if parent_session_id and parent_session_id in sessions:
        attempt_number = sessions[parent_session_id].attempt_number + 1

    sheet_result = None
    sheet_path: Path | None = None
    sheet_filename: str | None = None
    if sheet_image and sheet_image.filename:
        sheet_filename = sheet_image.filename
        sheet_path = _save_upload(sheet_image, session_id, "sheet")
        quality_ok, quality_msg = check_sheet_file_quality(sheet_path)
        if not quality_ok:
            raise HTTPException(status_code=400, detail=quality_msg)
        sheet_result = await analyze_sheet_image(sheet_path)

    perf_result = None
    perf_path: Path | None = None
    performance_filename: str | None = None
    if target_bpm is not None:
        target_bpm = max(25, min(250, target_bpm))
    if performance_bpm is not None:
        performance_bpm = max(25, min(250, performance_bpm))
    selected_scoring_dims: list[str] | None = None
    if scoring_dimensions:
        try:
            parsed = json.loads(scoring_dimensions)
            if isinstance(parsed, list):
                selected_scoring_dims = [str(x) for x in parsed]
        except json.JSONDecodeError:
            selected_scoring_dims = None

    resolved_beat_unit = resolve_tempo_beat_unit(
        tempo_beat_unit,
        sheet_result.tempo_beat_unit if sheet_result else None,
        sheet_result.time_signature if sheet_result else None,
    )
    perf_suffix = ""
    if performance_file and performance_file.filename:
        performance_filename = performance_file.filename
        perf_path = _save_upload(performance_file, session_id, "performance")
        perf_suffix = perf_path.suffix.lower()
        target_tempo = target_bpm or (sheet_result.tempo_bpm if sheet_result else None)
        perf_result = await analyze_performance(
            perf_path,
            performance_type,
            sheet_result,
            target_tempo,
            resolved_beat_unit,
            performance_bpm=performance_bpm,
        )
        if perf_result and perf_result.ai_mode == "audio":
            attach_clips_to_issues(perf_path, perf_result.issues, UPLOAD_DIR, session_id)
        elif perf_result and perf_result.ai_mode == "video" and perf_path:
            attach_clips_to_issues(perf_path, perf_result.issues, UPLOAD_DIR, session_id)

    is_partial, section_label, alignment_notice, scope_issues = detect_analysis_scope(
        sheet_result, perf_result, resolved_beat_unit
    )
    if perf_result and scope_issues:
        perf_result.issues = scope_issues + perf_result.issues

    image_suffixes = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
    posture_available = performance_type == "video" or perf_suffix in image_suffixes

    scores = compute_scores(
        sheet_result,
        perf_result,
        is_partial=is_partial,
        section_label=section_label,
        alignment_notice=alignment_notice,
        posture_available=posture_available,
        scoring_dimensions=selected_scoring_dims,
    )
    if perf_result and scores.deductions:
        sync_clips_to_deductions(perf_result.issues, scores.deductions)
    coaching = build_coaching_text(sheet_result, perf_result, scores)
    voice_url = await synthesize_voice(coaching, UPLOAD_DIR)

    if parent_session_id and parent_session_id in sessions:
        prev_score = sessions[parent_session_id].scores.overall
        score_delta = round(scores.overall - prev_score, 1)
        score_improved = score_delta > 0

    sheet_media_url = f"/media/{sheet_path.name}" if sheet_path else None
    sheet_preview_url: str | None = None
    if sheet_path:
        preview_path = UPLOAD_DIR / f"{session_id}_sheet_preview.png"
        if render_sheet_preview(sheet_path, preview_path):
            sheet_preview_url = f"/media/{preview_path.name}"
    performance_audio_url = f"/media/{perf_path.name}" if perf_path else None

    result = FullAnalysisResult(
        session_id=session_id,
        parent_session_id=parent_session_id,
        attempt_number=attempt_number,
        sheet=sheet_result,
        performance=perf_result,
        scores=scores,
        coaching_text=coaching,
        voice_audio_url=voice_url,
        sheet_media_url=sheet_media_url,
        sheet_preview_url=sheet_preview_url,
        sheet_filename=sheet_filename,
        performance_audio_url=performance_audio_url,
        performance_filename=performance_filename,
        score_improved=score_improved,
        score_delta=score_delta,
        tempo_beat_unit=resolved_beat_unit,
        scoring_dimensions=selected_scoring_dims or list(DEFAULT_SCORING_DIMENSIONS),
    )
    sessions[session_id] = result
    return result


@app.post("/api/rescore", response_model=FullAnalysisResult)
async def rescore_session(req: RescoreRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if not req.scoring_dimensions:
        raise HTTPException(status_code=400, detail="请至少勾选一项评分维度")

    posture_available = bool(session.scores.posture_available)
    scores = compute_scores(
        session.sheet,
        session.performance,
        is_partial=session.scores.is_partial,
        section_label=session.scores.section_label,
        alignment_notice=session.scores.alignment_notice,
        posture_available=posture_available,
        scoring_dimensions=req.scoring_dimensions,
    )
    coaching = build_coaching_text(session.sheet, session.performance, scores)
    voice_url = await synthesize_voice(coaching, UPLOAD_DIR)

    session.scores = scores
    session.coaching_text = coaching
    session.voice_audio_url = voice_url
    session.scoring_dimensions = list(req.scoring_dimensions)
    sessions[req.session_id] = session
    return session


@app.post("/api/mark-segment-fixed", response_model=MarkSegmentFixedResponse)
async def mark_segment_fixed(req: MarkSegmentFixedRequest):
    session = sessions.get(req.session_id)
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="会话不存在")

    bonus = 0.0
    all_fixed = True
    for seg in session.scores.practice_segments:
        if seg.id == req.segment_id:
            seg.fixed = True
            bonus = min(seg.deduction_points * 0.5, 3.0)
        if not seg.fixed:
            all_fixed = False

    if bonus > 0:
        session.scores.bonus_points = round(session.scores.bonus_points + bonus, 1)
        session.scores.overall = min(
            100.0,
            round(session.scores.overall + bonus, 1),
        )
        session.scores.total_deducted = max(0.0, round(session.scores.total_deducted - bonus, 1))

    return MarkSegmentFixedResponse(
        segment_id=req.segment_id,
        fixed=True,
        all_fixed=all_fixed,
        bonus_points=bonus,
    )


@app.get("/api/session/{session_id}", response_model=FullAnalysisResult)
async def get_session(session_id: str):
    return sessions[session_id]


@app.post("/api/follow-up", response_model=FollowUpResponse)
async def follow_up(req: FollowUpRequest):
    context = req.context_issue
    if req.session_id in sessions:
        context = sessions[req.session_id].coaching_text[:500]

    answer = await answer_follow_up(req.question, context)
    voice_url = await synthesize_voice(answer, UPLOAD_DIR)
    return FollowUpResponse(answer=answer, voice_audio_url=voice_url)
