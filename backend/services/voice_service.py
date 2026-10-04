import asyncio
import uuid
from pathlib import Path

from backend.config import settings
from backend.services.google_ai import is_google_configured


async def synthesize_voice(text: str, output_dir: Path) -> str | None:
    """用 Google Gemini TTS 把文字点评读成语音（与 GOOGLE_API_KEY 同一密钥）。"""
    if not settings.google_tts_enabled or not is_google_configured():
        return None

    cleaned = (text or "").strip()
    if not cleaned:
        return None

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"voice_{uuid.uuid4().hex[:8]}.wav"
    output_path = output_dir / filename
    snippet = cleaned[:2000]

    def _call() -> bytes | None:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.google_api_key)

        # 优先新版 Interactions TTS
        if hasattr(client, "interactions"):
            try:
                interaction = client.interactions.create(
                    model=settings.google_tts_model,
                    input=[
                        {
                            "type": "user_input",
                            "content": [
                                {
                                    "type": "text",
                                    "text": snippet,
                                    "annotations": [
                                        {
                                            "type": "speech_metadata",
                                            "style": settings.google_tts_style,
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                    response_format={"type": "audio"},
                    generation_config={
                        "speech_config": [{"voice": settings.google_tts_voice}],
                    },
                )
                if interaction.output_audio and interaction.output_audio.data:
                    import base64

                    return base64.b64decode(interaction.output_audio.data)
            except Exception:
                pass

        # 回退：generateContent + AUDIO
        response = client.models.generate_content(
            model=settings.google_tts_model,
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": snippet,
                            "speech_metadata": {"style": settings.google_tts_style},
                        }
                    ],
                }
            ],
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(voice=settings.google_tts_voice)
                ),
            ),
        )
        part = response.candidates[0].content.parts[0]
        if not part.inline_data or not part.inline_data.data:
            return None
        data = part.inline_data.data
        if isinstance(data, str):
            import base64

            return base64.b64decode(data)
        return bytes(data)

    try:
        audio_bytes = await asyncio.to_thread(_call)
        if not audio_bytes:
            return None
        output_path.write_bytes(audio_bytes)
        return f"/media/{filename}"
    except Exception:
        return None
