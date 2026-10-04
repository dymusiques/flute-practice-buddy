from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    google_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    )
    google_model: str = Field(
        default="gemini-3.8-flash",
        validation_alias=AliasChoices("GOOGLE_MODEL", "GEMINI_MODEL"),
    )
    # 开发默认关语音，省 Gemini TTS 配额；上线可在 .env 设 GOOGLE_TTS_ENABLED=true
    google_tts_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("GOOGLE_TTS_ENABLED", "GEMINI_TTS_ENABLED"),
    )
    google_tts_model: str = Field(
        default="gemini-2.5-flash-preview-tts",
        validation_alias=AliasChoices("GOOGLE_TTS_MODEL", "GEMINI_TTS_MODEL"),
    )
    google_tts_voice: str = "Kore"
    google_tts_style: str = "温柔、鼓励型的中文长笛老师，语速适中，发音清晰"
    upload_dir: str = "uploads"
    cors_origins: str = "http://localhost:3000"


settings = Settings()
