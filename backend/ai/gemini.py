"""Gemini generateContent client. API key never logged or returned."""
import httpx

from backend.ai.briefing import format_explanation, gemini_prompt
from backend.ai.config import gemini_api_key, gemini_model

TIMEOUT = 15.0
GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'


class GeminiError(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def _redact(text: str, key: str | None) -> str:
    if key and key in text:
        return text.replace(key, '[redacted]')
    return text


def _map_http_error(response, key: str | None) -> GeminiError:
    detail = f'Gemini request failed ({response.status_code})'
    try:
        payload = response.json()
        error = payload.get('error') if isinstance(payload, dict) else None
        status = error.get('status') if isinstance(error, dict) else None
        message = error.get('message') if isinstance(error, dict) else None
        lowered = message.lower() if isinstance(message, str) else ''
        if response.status_code == 429 or status == 'RESOURCE_EXHAUSTED' or 'quota' in lowered:
            detail = 'Gemini quota exceeded'
        elif status in ('UNAUTHENTICATED', 'PERMISSION_DENIED') or 'api key' in lowered:
            detail = 'Gemini API key is invalid'
        elif isinstance(message, str) and message.strip():
            detail = _redact(message.strip(), key)[:180]
    except ValueError:
        pass
    return GeminiError('explain_upstream_error', detail)


def explain_from_evidence(evidence: dict) -> str:
    key = gemini_api_key()
    if not key:
        raise GeminiError('explain_not_configured', 'Gemini is not configured')
    url = GENERATE_URL.format(model=gemini_model())
    payload = {
        'contents': [{'parts': [{'text': gemini_prompt(evidence)}]}],
        'generationConfig': {
            'temperature': 0.2,
            'maxOutputTokens': 512,
            'responseMimeType': 'application/json',
        },
    }
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.post(
                url,
                headers={'x-goog-api-key': key, 'content-type': 'application/json'},
                json=payload,
            )
    except httpx.TimeoutException as error:
        raise GeminiError('explain_timeout', 'Gemini request timed out') from error
    except httpx.HTTPError as error:
        raise GeminiError('explain_upstream_error', 'Gemini request failed') from error
    if response.status_code >= 400:
        raise _map_http_error(response, key)
    try:
        body = response.json()
        text = body['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise GeminiError('explain_upstream_error', 'Gemini response was not usable') from error
    if not isinstance(text, str) or not text.strip():
        raise GeminiError('explain_upstream_error', 'Gemini response was empty')
    return format_explanation(text)
