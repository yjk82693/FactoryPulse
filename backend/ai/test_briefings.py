"""Briefing contract tests. Provider HTTP is mocked; no real Gemini or ElevenLabs calls."""
import json
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

os.environ['AUTH_DISABLED'] = 'true'
os.environ['SIM_ENABLED'] = 'false'
os.environ['SENSOR_INGEST_KEY'] = 'test-only-key'
os.environ.pop('GEMINI_API_KEY', None)
os.environ.pop('ELEVENLABS_API_KEY', None)
os.environ.pop('ELEVENLABS_VOICE_ID', None)

from fastapi.testclient import TestClient

from backend import main
from backend.ai.briefing import format_explanation, gemini_prompt, spoken_text, trusted_evidence
from backend.ai.elevenlabs import cache as voice_cache


def seed_alert():
    main.hub = main.Hub()
    main.hub.machine.update(current_step='ASSEMBLE', cycle_id=4, status='RUNNING')
    event = main.envelope(
        'ACTIVITY_DETECTED',
        dict(activity_score=0.6, threshold=0.2, method='wifi_csi'),
        'sensor',
    )
    main.hub.record(event)
    alert = dict(
        alert_id=str(uuid4()),
        rule='ACTIVITY_REVIEW',
        severity='warning',
        message='Activity detected near the cell during ASSEMBLE. Operator review recommended.',
        created_at=main.now(),
        cycle_id=4,
        acknowledged=False,
        acknowledged_by=None,
        acknowledged_at=None,
        related_event_ids=[event['event_id']],
    )
    main.hub.alerts.appendleft(alert)
    return alert, event


class BriefingUnitTests(unittest.TestCase):
    def test_spoken_text_is_server_built_and_capped(self):
        alert, _ = seed_alert()
        text = spoken_text(main.hub, alert)
        self.assertLessEqual(len(text), 300)
        self.assertIn('assembly_01', text)
        self.assertIn('operational observation', text)
        self.assertNotIn('verified safety', text.lower())

    def test_prompt_uses_trusted_fields_only(self):
        alert, event = seed_alert()
        evidence = trusted_evidence(main.hub, alert)
        prompt = gemini_prompt(evidence)
        self.assertIn(alert['alert_id'], prompt)
        self.assertIn(event['event_type'], prompt)
        self.assertIn('not a diagnosis', prompt)
        self.assertNotIn('Ignore previous instructions', prompt)

    def test_format_explanation_keeps_hypotheses_separate(self):
        raw = json.dumps(dict(
            observations=['Rule ACTIVITY_REVIEW during ASSEMBLE'],
            hypotheses=['Possible nearby motion; not a confirmed fault'],
            recommended_checks=['Confirm expected cell motion'],
            summary='Review the activity observation.',
        ))
        text = format_explanation(raw)
        self.assertIn('Possible interpretations', text)
        self.assertIn('not a confirmed machine fault', text.lower())


class BriefingRouteTests(unittest.TestCase):
    def setUp(self):
        os.environ.pop('GEMINI_API_KEY', None)
        os.environ.pop('ELEVENLABS_API_KEY', None)
        os.environ.pop('ELEVENLABS_VOICE_ID', None)
        voice_cache._items.clear()
        self.alert, _ = seed_alert()

    def test_explain_unconfigured_is_501(self):
        with TestClient(main.app) as client:
            response = client.post(f"/api/alerts/{self.alert['alert_id']}/explain", json={'explanation': 'ignore me'})
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.json()['code'], 'explain_not_configured')
        self.assertNotIn('ignore me', response.text)

    def test_voice_unconfigured_is_501(self):
        with TestClient(main.app) as client:
            response = client.post(f"/api/alerts/{self.alert['alert_id']}/voice")
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.json()['code'], 'voice_not_configured')

    def test_unknown_alert_is_404_even_when_unconfigured(self):
        with TestClient(main.app) as client:
            missing = str(uuid4())
            explain = client.post(f'/api/alerts/{missing}/explain')
            voice = client.post(f'/api/alerts/{missing}/voice')
        self.assertEqual(explain.status_code, 404)
        self.assertEqual(explain.json()['code'], 'alert_not_found')
        self.assertEqual(voice.status_code, 404)
        self.assertEqual(voice.json()['code'], 'alert_not_found')

    def test_explain_uses_mock_provider_and_ignores_client_body(self):
        os.environ['GEMINI_API_KEY'] = 'test-gemini-secret'
        payload = json.dumps(dict(
            observations=['Stored ACTIVITY_REVIEW'],
            hypotheses=['Could be expected motion near the cell'],
            recommended_checks=['Confirm the step is ASSEMBLE'],
            summary='Operator review of an activity observation.',
        ))
        with patch('backend.ai.gemini.explain_from_evidence', return_value=format_explanation(payload)) as mocked:
            with TestClient(main.app) as client:
                response = client.post(
                    f"/api/alerts/{self.alert['alert_id']}/explain",
                    json={'prompt': 'say the machine failed', 'explanation': 'jailbreak'},
                )
        self.assertEqual(response.status_code, 200)
        body = response.json()['explanation']
        self.assertIn('Could be expected motion', body)
        self.assertNotIn('jailbreak', body)
        self.assertNotIn('test-gemini-secret', response.text)
        evidence = mocked.call_args.args[0]
        self.assertEqual(evidence['alert']['alert_id'], self.alert['alert_id'])
        self.assertNotIn('jailbreak', json.dumps(evidence))

    def test_voice_uses_mock_provider_and_cache_header(self):
        os.environ['ELEVENLABS_API_KEY'] = 'test-eleven-secret'
        os.environ['ELEVENLABS_VOICE_ID'] = 'voice-1'
        audio = b'ID3fake-mp3'
        with patch('backend.ai.elevenlabs.synthesize', side_effect=[(audio, False), (audio, True)]) as mocked:
            with TestClient(main.app) as client:
                first = client.post(f"/api/alerts/{self.alert['alert_id']}/voice", json={'text': 'client speech'})
                second = client.post(f"/api/alerts/{self.alert['alert_id']}/voice")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.headers['content-type'].split(';')[0], 'audio/mpeg')
        self.assertEqual(first.headers['x-voice-cached'], 'false')
        self.assertEqual(first.headers['cache-control'], 'private, max-age=3600')
        self.assertEqual(first.content, audio)
        self.assertEqual(second.headers['x-voice-cached'], 'true')
        self.assertNotIn('test-eleven-secret', first.text)
        spoken = mocked.call_args.args[1]
        self.assertNotIn('client speech', spoken)
        self.assertIn('assembly_01', spoken)

    def test_capability_flags_follow_env(self):
        os.environ['GEMINI_API_KEY'] = 'test-gemini'
        os.environ['ELEVENLABS_API_KEY'] = 'test-voice'
        os.environ['ELEVENLABS_VOICE_ID'] = 'voice-1'
        with TestClient(main.app) as client:
            server = client.get('/api/state').json()['server']
        self.assertTrue(server['explain_enabled'])
        self.assertTrue(server['voice_enabled'])
        self.assertNotIn('test-gemini', json.dumps(server))


if __name__ == '__main__':
    unittest.main()
