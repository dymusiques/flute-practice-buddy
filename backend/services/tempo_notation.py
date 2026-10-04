"""谱面式速度标记：♩ = 88（不用 BPM 对用户展示）"""

from typing import Literal

TempoBeatUnit = Literal["half", "quarter", "eighth"]

# 后端纯文本用中文音符名（避免 Unicode 音乐符号在部分环境显示成方块）
SYMBOLS: dict[str, str] = {
    "half": "二分音符",
    "quarter": "四分音符",
    "eighth": "八分音符",
}

LABELS: dict[str, str] = {
    "half": "二分音符",
    "quarter": "四分音符",
    "eighth": "八分音符",
}


def format_tempo_mark(tempo: float | int, unit: TempoBeatUnit = "quarter") -> str:
    sym = SYMBOLS.get(unit, "♩")
    return f"{sym} = {round(float(tempo))}"


def tempo_to_quarter_bpm(tempo: float | int, unit: TempoBeatUnit = "quarter") -> float:
    t = float(tempo)
    if unit == "half":
        return t * 2
    if unit == "eighth":
        return t / 2
    return t


def quarter_bpm_to_tempo(quarter_bpm: float, unit: TempoBeatUnit = "quarter") -> int:
    q = float(quarter_bpm)
    if unit == "half":
        return round(q / 2)
    if unit == "eighth":
        return round(q * 2)
    return round(q)


VALID_TEMPO_BEAT_UNITS: frozenset[str] = frozenset({"half", "quarter", "eighth"})


def resolve_tempo_beat_unit(
    requested: str,
    sheet_tempo_beat_unit: str | None,
    time_signature: str | None,
) -> TempoBeatUnit:
    """用户指定 > 谱面识谱 > 按拍号猜测。"""
    if requested in VALID_TEMPO_BEAT_UNITS:
        return requested  # type: ignore[return-value]
    if sheet_tempo_beat_unit in VALID_TEMPO_BEAT_UNITS:
        return sheet_tempo_beat_unit  # type: ignore[return-value]
    return guess_tempo_beat_unit(time_signature)


def parse_tempo_beat_unit(raw: object) -> TempoBeatUnit | None:
    if raw is None:
        return None
    text = str(raw).lower().strip()
    if text in VALID_TEMPO_BEAT_UNITS:
        return text  # type: ignore[return-value]
    if "eighth" in text or "八分" in text:
        return "eighth"
    if "half" in text or "二分" in text:
        return "half"
    if "quarter" in text or "四分" in text:
        return "quarter"
    return None


def guess_tempo_beat_unit(time_signature: str | None) -> TempoBeatUnit:
    if not time_signature:
        return "quarter"
    import re

    m = re.search(r"(\d+)\s*/\s*(\d+)", time_signature)
    if not m:
        return "quarter"
    denom = int(m.group(2))
    if denom == 2:
        return "half"
    if denom == 8:
        return "eighth"
    return "quarter"
