import json
import re
from pathlib import Path

from backend.models.schemas import IssueItem, SheetAnalysisResult
from backend.services.google_ai import generate_text_with_image, is_google_configured
from backend.services.tempo_notation import parse_tempo_beat_unit

SHEET_PROMPT = """你是一位专业的长笛教学助手。请扫描上传文件中的**全部页面**（多页 PDF 必须每一页都看），返回 JSON（不要 markdown）：
{
  "title": "曲目标题",
  "composer": "作曲家",
  "key_signature": "调性，含大调/小调，如 G 大调、E 小调",
  "time_signature": "拍号如 3/8、4/4",
  "tempo_bpm": 数字或null,
  "tempo_beat_unit": "half或quarter或eighth（速度数字以哪种音符为一拍，看谱面 ♩= 或 ♪= 标记）",
  "tempo_marking": "速度术语",
  "total_measures": 整首乐谱总小节数（整数，含所有页）,
  "measures_per_system": 谱面每一行（每个系统）有几小节，如 4,
  "page_count": 页数,
  "measure_range": "可见小节范围如 1-40；整首齐全则 null",
  "expected_notes": ["D4", "G4", "B4", "D5", "..."],
  "note_measures": [1,1,1,2,...],
  "note_staff_lines": [1,1,1,1,2,...],
  "note_measure_in_line": [1,2,3,4,1,...],
  "layout_type": "standard 或 dual_preview_main",
  "preview_note_count": 预览小谱占用的音符个数（整数，无预览则 0）,
  "performance_staff_start_line": 实际演奏主谱从第几行开始（自上而下，整数）
}

要求：
1. 必须扫完整首（所有页、所有小节）。
2. expected_notes 是**扁平数组**：每个元素只能是单个音名+八度，如 "D4"、"F#5"、"Bb3"。
3. note_measures / note_staff_lines / note_measure_in_line 必须与 expected_notes **等长**，来自谱面排版（第几行、该行第几小节、全局第几小节）。
4. 禁止把小节范围或句子写进 expected_notes（不要 "m.1-4: ..." 这种格式）。
5. 按从第 1 小节到最后一小节的演奏顺序列出全部主要音符（含重复音），通常应有几十到上百个元素。
6. **重要 — 上小下大布局**：若同一页上方有**较小**音符的短谱/示例行，下方有**较大**音符的主谱（如 Allegro 正文），学生通常从**下方大谱**开始吹。此时：
   - layout_type 填 dual_preview_main
   - expected_notes 仍可按整页顺序列出，但务必填 preview_note_count（上方小谱有多少个音）和 performance_staff_start_line（主谱是第几行）
   - **主谱小节从 1 起算**：note_measures、note_staff_lines、note_measure_in_line 只对主谱有效，Allegro 第一个音必须是 measure=1、staff_line=1（不要延续上方预览谱的小节编号）
7. 不要输出练习建议。"""

SHEET_RETRY_PROMPT = """上次识谱的 expected_notes 格式不对（不能含小节标签或整句描述）。
请重新扫描**全部页面**，只返回 JSON（不要 markdown），且 expected_notes 必须是扁平音名数组，例如：
["D4","G4","B4","D5","G5",...]
每个元素一个音，覆盖第 1 小节到最后一小节的全部主要音符。"""

TEMPO_ONLY_PROMPT = """请只看谱面左上角或第一页的速度标记与拍号，返回 JSON（不要 markdown）：
{"tempo_bpm": 数字或null, "tempo_beat_unit": "half或quarter或eighth", "time_signature": "如 4/4"}
若看到 ♩= 或 ♪= 等，务必把数字填进 tempo_bpm。"""

NOTE_TOKEN_RE = re.compile(r"\b([A-G](?:#|b)?\d+)\b", re.IGNORECASE)


def _failed_sheet_analysis(*, reason: str | None = None) -> SheetAnalysisResult:
    issues: list[IssueItem] = []
    if reason:
        issues.append(
            IssueItem(
                category="识谱",
                severity="warning",
                message=reason,
                suggestion="请检查 Google API 配额或网络，或换更清晰的 PDF 后重试",
            )
        )
    return SheetAnalysisResult(
        title="谱面识谱未成功",
        key_signature="未知",
        time_signature="—",
        tempo_bpm=None,
        total_measures=None,
        measure_range=None,
        expected_notes=[],
        articulation_markings=[],
        issues=issues,
        ai_mode="mock",
    )


def _notes_look_grouped(raw_notes: list) -> bool:
    if not raw_notes:
        return False
    grouped = 0
    for item in raw_notes[: min(12, len(raw_notes))]:
        text = str(item)
        if re.search(r"m\.\s*\d|小节|:", text, re.I):
            grouped += 1
        elif len(NOTE_TOKEN_RE.findall(text)) > 1:
            grouped += 1
    return grouped >= max(1, len(raw_notes[: min(12, len(raw_notes))]) // 2)


def _flatten_expected_notes(raw_notes: list) -> list[str]:
    flat: list[str] = []
    for item in raw_notes:
        text = str(item).strip()
        if not text:
            continue
        tokens = NOTE_TOKEN_RE.findall(text)
        if tokens:
            for t in tokens:
                flat.append(t[0].upper() + t[1:])
        elif re.match(r"^[A-G][#b]?\d+$", text, re.I):
            flat.append(text[0].upper() + text[1:])
    return flat


def _note_count_suspicious(note_count: int, total_measures: int | None) -> bool:
    if note_count < 8:
        return True
    if total_measures and note_count < total_measures * 0.8:
        return True
    return False


def _parse_int_list(raw: object, expected_len: int | None = None) -> list[int] | None:
    if not isinstance(raw, list):
        return None
    out: list[int] = []
    for item in raw:
        try:
            out.append(max(1, int(item)))
        except (TypeError, ValueError):
            return None
    if expected_len is not None and len(out) != expected_len:
        return None
    return out if out else None


def _parse_sheet_json(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def _build_result(data: dict) -> SheetAnalysisResult:
    total_measures = data.get("total_measures")
    if total_measures is not None:
        try:
            total_measures = int(total_measures)
        except (TypeError, ValueError):
            total_measures = None

    raw_notes = data.get("expected_notes", [])
    expected_notes = _flatten_expected_notes(raw_notes)

    issues: list[IssueItem] = []
    if _note_count_suspicious(len(expected_notes), total_measures):
        issues.append(
            IssueItem(
                category="识谱",
                severity="warning",
                message=(
                    f"音符序列可能不完整（识谱 {len(expected_notes)} 个音"
                    f"{f'，谱面约 {total_measures} 小节' if total_measures else ''}）"
                ),
                suggestion="若扣分明细与谱面不符，请换更清晰的 PDF 或分页上传后重试",
            )
        )

    title = data.get("title", "未识别曲目")
    composer = data.get("composer")
    if composer and composer not in title:
        title = f"{title}（{composer}）"

    measures_per_system = data.get("measures_per_system")
    try:
        measures_per_system = int(measures_per_system) if measures_per_system is not None else None
    except (TypeError, ValueError):
        measures_per_system = None

    note_len = len(expected_notes)
    note_measures = _parse_int_list(data.get("note_measures"), note_len if note_len else None)
    note_staff_lines = _parse_int_list(data.get("note_staff_lines"), note_len if note_len else None)
    note_measure_in_line = _parse_int_list(
        data.get("note_measure_in_line"), note_len if note_len else None
    )

    layout_raw = str(data.get("layout_type") or "standard").lower()
    layout_type = "dual_preview_main" if "dual" in layout_raw or "preview" in layout_raw else "standard"

    preview_note_count = data.get("preview_note_count")
    try:
        preview_note_count = int(preview_note_count) if preview_note_count is not None else None
    except (TypeError, ValueError):
        preview_note_count = None

    performance_staff_start_line = data.get("performance_staff_start_line")
    try:
        performance_staff_start_line = (
            int(performance_staff_start_line) if performance_staff_start_line is not None else None
        )
    except (TypeError, ValueError):
        performance_staff_start_line = None

    return SheetAnalysisResult(
        title=title,
        key_signature=data.get("key_signature", "未知"),
        time_signature=data.get("time_signature", "4/4"),
        tempo_bpm=data.get("tempo_bpm"),
        tempo_beat_unit=parse_tempo_beat_unit(data.get("tempo_beat_unit")),
        total_measures=total_measures,
        measures_per_system=measures_per_system,
        note_measures=note_measures,
        note_staff_lines=note_staff_lines,
        note_measure_in_line=note_measure_in_line,
        measure_range=data.get("measure_range"),
        layout_type=layout_type,
        preview_note_count=preview_note_count,
        performance_staff_start_line=performance_staff_start_line,
        expected_notes=expected_notes,
        articulation_markings=[],
        issues=issues,
        ai_mode="vision",
    )


async def analyze_sheet_image(image_path: Path) -> SheetAnalysisResult:
    if not is_google_configured():
        return _failed_sheet_analysis()

    try:
        text = await generate_text_with_image(SHEET_PROMPT, image_path)
        if not text:
            return _failed_sheet_analysis(reason="谱面 AI 识谱无响应（可能是 API 配额用尽）")

        data = _parse_sheet_json(text)
        if not data:
            return _failed_sheet_analysis()

        result = _build_result(data)

        needs_retry = (
            _notes_look_grouped(data.get("expected_notes", []))
            or _note_count_suspicious(len(result.expected_notes), result.total_measures)
        )
        if needs_retry:
            retry_text = await generate_text_with_image(
                f"{SHEET_PROMPT}\n\n{SHEET_RETRY_PROMPT}",
                image_path,
            )
            if retry_text:
                retry_data = _parse_sheet_json(retry_text)
                if retry_data:
                    retry_result = _build_result(retry_data)
                    if len(retry_result.expected_notes) > len(result.expected_notes):
                        result = retry_result

        if result.tempo_bpm is None:
            tempo_text = await generate_text_with_image(TEMPO_ONLY_PROMPT, image_path)
            tempo_data = _parse_sheet_json(tempo_text) if tempo_text else None
            if tempo_data and tempo_data.get("tempo_bpm") is not None:
                try:
                    result.tempo_bpm = int(tempo_data["tempo_bpm"])
                except (TypeError, ValueError):
                    pass
                unit = parse_tempo_beat_unit(tempo_data.get("tempo_beat_unit"))
                if unit:
                    result.tempo_beat_unit = unit
                if tempo_data.get("time_signature"):
                    result.time_signature = str(tempo_data["time_signature"])

        return result
    except Exception:
        failed = _failed_sheet_analysis()
        try:
            tempo_text = await generate_text_with_image(TEMPO_ONLY_PROMPT, image_path)
            tempo_data = _parse_sheet_json(tempo_text) if tempo_text else None
            if tempo_data and tempo_data.get("tempo_bpm") is not None:
                try:
                    failed.tempo_bpm = int(tempo_data["tempo_bpm"])
                except (TypeError, ValueError):
                    pass
                unit = parse_tempo_beat_unit(tempo_data.get("tempo_beat_unit"))
                if unit:
                    failed.tempo_beat_unit = unit
                if tempo_data.get("time_signature"):
                    failed.time_signature = str(tempo_data["time_signature"])
        except Exception:
            pass
        return failed
