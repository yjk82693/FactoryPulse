"""Contract integration checks; no ESP32 hardware required."""
import os
import unittest
import importlib.util
from pathlib import Path
from uuid import uuid4

os.environ['AUTH_DISABLED'] = 'true'
os.environ['SIM_ENABLED'] = 'false'
os.environ['SENSOR_INGEST_KEY'] = 'test-only-key'

from fastapi.testclient import TestClient
from backend import main


class LiveTests(unittest.TestCase):
    def test_csi_preprocessing(self):
        path = Path(__file__).parents[1] / 'sensing/processing/python/csi_stream.py'
        spec = importlib.util.spec_from_file_location('csi_stream', path)
        detector = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(detector)
        self.assertIsNone(detector.amplitude('CSI,broken'))
        frame = detector.amplitude('CSI,0,-50,0,128,' + ' '.join(['3', '4'] * 64))
        self.assertEqual(len(frame), 52)
        self.assertAlmostEqual(detector.score([frame] * 20), 0., places=6)
        moving = frame.copy()
        moving[:26] *= 2
        self.assertGreater(detector.score([frame, moving] * 10), 0.)
        self.assertLess(detector.bounded(100), 1.)

    def test_ingest_rules_socket_and_disconnect(self):
        main.hub = main.Hub()
        headers = {'X-Sensor-Id': 'csi-rx-01', 'X-Sensor-Key': 'test-only-key'}
        event = main.envelope('ACTIVITY_DETECTED',
                              dict(activity_score=.6, threshold=.2, method='wifi_csi'), 'sensor')
        with TestClient(main.app) as client, client.websocket_connect('/ws') as ws:
            self.assertEqual(ws.receive_json()['type'], 'ready')
            self.assertEqual(ws.receive_json()['type'], 'state')
            self.assertEqual(client.post('/api/events', json=event).status_code, 401)
            main.hub.machine.update(current_step='ASSEMBLE', cycle_id=1, status='RUNNING')
            self.assertEqual(client.post('/api/events', json=event, headers=headers).status_code, 202)
            seen = []
            while 'alert' not in seen:
                seen.append(ws.receive_json()['type'])
            self.assertIn('event', seen)
            alert = client.get('/api/alerts').json()[0]
            self.assertEqual(alert['severity'], 'warning')
            self.assertTrue(client.post('/api/events', json=event, headers=headers).json()['duplicate'])
            event['event_id'] = str(uuid4())
            client.post('/api/events', json=event, headers=headers)
            self.assertEqual(len(client.get('/api/alerts').json()), 1)
            self.assertTrue(client.post(f"/api/alerts/{alert['alert_id']}/ack").json()['acknowledged'])
            event['payload']['activity_score'] = 2
            self.assertEqual(client.post('/api/events', json=event, headers=headers).status_code, 422)
            event['source'] = 'machine'
            self.assertEqual(client.post('/api/events', json=event, headers=headers).status_code, 403)
            main.hub.last_sensor = 0
            # A state push proves the real disconnect timer ran, without sleeping five seconds.
            while True:
                message = ws.receive_json()
                if message['type'] == 'state' and not message['data']['sensor']['connected']:
                    self.assertFalse(message['data']['sensor']['active'])
                    break


if __name__ == '__main__':
    unittest.main()
