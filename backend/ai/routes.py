"""C-owned briefing routes. Registered from backend.main; does not own ingest or Console CRUD."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from backend.ai import elevenlabs as voice_service
from backend.ai import gemini as gemini_service
from backend.ai.briefing import spoken_text, trusted_evidence
from backend.ai.config import explain_enabled, voice_enabled
from backend.ai.elevenlabs import VoiceError
from backend.ai.gemini import GeminiError


def find_alert(hub, alert_id: str) -> dict:
    for alert in hub.alerts:
        if alert.get('alert_id') == alert_id:
            return alert
    raise HTTPException(404, dict(detail='Alert not found', code='alert_not_found'))


def create_briefing_router(get_hub):
    router = APIRouter()

    @router.post('/api/alerts/{alert_id}/explain')
    async def explain_alert(alert_id: str, request: Request):
        await request.body()
        if not explain_enabled():
            raise HTTPException(501, dict(detail='Gemini is not configured', code='explain_not_configured'))
        hub = get_hub()
        alert = find_alert(hub, alert_id)
        try:
            explanation = gemini_service.explain_from_evidence(trusted_evidence(hub, alert))
        except GeminiError as error:
            status = 504 if error.code == 'explain_timeout' else 501 if error.code == 'explain_not_configured' else 502
            raise HTTPException(status, dict(detail=error.detail, code=error.code)) from error
        return dict(explanation=explanation)

    @router.post('/api/alerts/{alert_id}/voice')
    async def voice_alert(alert_id: str, request: Request):
        await request.body()
        if not voice_enabled():
            raise HTTPException(501, dict(detail='ElevenLabs is not configured', code='voice_not_configured'))
        hub = get_hub()
        alert = find_alert(hub, alert_id)
        spoken = spoken_text(hub, alert)
        try:
            audio, cached = voice_service.synthesize(alert_id, spoken)
        except VoiceError as error:
            status = 504 if error.code == 'voice_timeout' else 501 if error.code == 'voice_not_configured' else 502
            raise HTTPException(status, dict(detail=error.detail, code=error.code)) from error
        return Response(
            content=audio,
            media_type='audio/mpeg',
            headers={
                'Cache-Control': 'private, max-age=3600',
                'X-Voice-Cached': 'true' if cached else 'false',
            },
        )

    return router
