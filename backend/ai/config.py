"""Capability flags from env. Values are never logged or returned."""
import os


def _present(name: str) -> bool:
    value = os.getenv(name, '').strip()
    return bool(value)


def gemini_api_key() -> str | None:
    value = os.getenv('GEMINI_API_KEY', '').strip()
    return value or None


def gemini_model() -> str:
    return os.getenv('GEMINI_MODEL', '').strip() or 'gemini-2.0-flash'


def elevenlabs_api_key() -> str | None:
    value = os.getenv('ELEVENLABS_API_KEY', '').strip()
    return value or None


def elevenlabs_voice_id() -> str | None:
    value = os.getenv('ELEVENLABS_VOICE_ID', '').strip()
    return value or None


def elevenlabs_model_id() -> str | None:
    value = os.getenv('ELEVENLABS_MODEL_ID', '').strip()
    return value or None


def explain_enabled() -> bool:
    return _present('GEMINI_API_KEY')


def voice_enabled() -> bool:
    return _present('ELEVENLABS_API_KEY') and _present('ELEVENLABS_VOICE_ID')


def briefing_flags() -> dict:
    return dict(voice_enabled=voice_enabled(), explain_enabled=explain_enabled())
