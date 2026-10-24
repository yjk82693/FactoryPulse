"""ElevenLabs TTS client and in-memory LRU cache. API key never logged or returned."""
from collections import OrderedDict
import hashlib
import httpx

from backend.ai.config import elevenlabs_api_key, elevenlabs_model_id, elevenlabs_voice_id

TIMEOUT = 15.0
TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}'
CACHE_SIZE = 50


class VoiceError(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


class VoiceCache:
    def __init__(self, maxsize: int = CACHE_SIZE):
        self.maxsize = maxsize
        self._items: OrderedDict[str, bytes] = OrderedDict()

    def get(self, key: str) -> bytes | None:
        if key not in self._items:
            return None
        self._items.move_to_end(key)
        return self._items[key]

    def put(self, key: str, value: bytes) -> None:
        if key in self._items:
            self._items.move_to_end(key)
        self._items[key] = value
        while len(self._items) > self.maxsize:
            self._items.popitem(last=False)


cache = VoiceCache()


def cache_key(alert_id: str, spoken: str) -> str:
    digest = hashlib.sha256(spoken.encode()).hexdigest()
    return f'{alert_id}:{digest}'


def synthesize(alert_id: str, spoken: str) -> tuple[bytes, bool]:
    key = elevenlabs_api_key()
    voice_id = elevenlabs_voice_id()
    if not key or not voice_id:
        raise VoiceError('voice_not_configured', 'ElevenLabs is not configured')
    item_key = cache_key(alert_id, spoken)
    cached = cache.get(item_key)
    if cached is not None:
        return cached, True
    body: dict = {'text': spoken}
    model_id = elevenlabs_model_id()
    if model_id:
        body['model_id'] = model_id
    url = TTS_URL.format(voice_id=voice_id)
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.post(
                url,
                headers={'xi-api-key': key, 'accept': 'audio/mpeg', 'content-type': 'application/json'},
                json=body,
            )
    except httpx.TimeoutException as error:
        raise VoiceError('voice_timeout', 'ElevenLabs request timed out') from error
    except httpx.HTTPError as error:
        raise VoiceError('voice_upstream_error', 'ElevenLabs request failed') from error
    if response.status_code >= 400:
        detail = f'ElevenLabs request failed ({response.status_code})'
        try:
            payload = response.json()
            inner = payload.get('detail') if isinstance(payload, dict) else None
            code = inner.get('code') if isinstance(inner, dict) else None
            if code == 'invalid_api_key':
                detail = 'ElevenLabs API key is invalid'
        except ValueError:
            pass
        raise VoiceError('voice_upstream_error', detail)
    audio = response.content
    content_type = (response.headers.get('content-type') or '').split(';')[0].strip()
    if content_type and content_type != 'audio/mpeg':
        raise VoiceError('voice_upstream_error', 'ElevenLabs response was not audio')
    if not audio:
        raise VoiceError('voice_upstream_error', 'ElevenLabs response was empty')
    cache.put(item_key, audio)
    return audio, False
