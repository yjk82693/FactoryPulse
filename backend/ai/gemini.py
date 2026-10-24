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


def explain_from_evidence(evidence: dict) -> str:
    key = gemini_api_key()
    if not key:
        raise GeminiError('explain_not_configured', 'Gemini is not configured')
    url = GENERATE_URL.format(model=gemini_model())
    payload = {
        'contents': [{'parts': [{'text': gemini_prompt(evidence)}]}],
        'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 512},
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
        raise GeminiError('explain_upstream_error', 'Gemini request failed')
    try:
        body = response.json()
        text = body['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise GeminiError('explain_upstream_error', 'Gemini response was not usable') from error
    if not isinstance(text, str) or not text.strip():
        raise GeminiError('explain_upstream_error', 'Gemini response was empty')
    return format_explanation(text)
