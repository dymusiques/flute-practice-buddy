"""加载演奏音频：macOS 上用 afconvert 支持 m4a/caf 等 librosa 无法直接读的格式。"""

import subprocess
import tempfile
from pathlib import Path

import librosa
import numpy as np

CONVERT_SUFFIXES = {
    ".m4a", ".aac", ".caf", ".aif", ".aiff", ".amr", ".3gp",
    ".mp4", ".mov", ".m4v",
}


def _afconvert_to_wav(source: Path) -> Path:
    out = Path(tempfile.mktemp(suffix=".wav"))
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16", str(source), str(out)],
        check=True,
        capture_output=True,
    )
    return out


def load_audio(path: Path, sr: int = 22050) -> tuple[np.ndarray, int]:
    suffix = path.suffix.lower()
    temp_wav: Path | None = None
    try:
        load_path = path
        if suffix in CONVERT_SUFFIXES:
            temp_wav = _afconvert_to_wav(path)
            load_path = temp_wav
        y, sr_out = librosa.load(str(load_path), sr=sr, mono=True)
        return y, sr_out
    finally:
        if temp_wav and temp_wav.exists():
            temp_wav.unlink(missing_ok=True)
