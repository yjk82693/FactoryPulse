"""Contract-level Console behavior, including references and failed-write rollback."""
import os
import unittest
from unittest.mock import patch

os.environ['AUTH_DISABLED'] = 'true'
os.environ['SIM_ENABLED'] = 'false'
os.environ['SENSOR_INGEST_KEY'] = 'test-only-key'

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from backend import main, auth


class ConsoleTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'AUTH_DISABLED': 'true', 'SIM_ENABLED': 'false', 'DATABASE_URL': ''})
        self.env.start()
        main.hub = main.Hub()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.env.stop()

    def machine(self, **patches):
        body = dict(name='Press-01', kind='press', zone_id='zone-a', operating_status='RUNNING', profile_id='prf-press-1')
        body.update(patches)
        response = self.client.post('/api/console/machines', json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_catalog_and_sensor_read_only(self):
        data = self.client.get('/api/console/catalog').json()
        self.assertEqual(set(data), {'zones','templates','profiles','profile_versions','calibrations','machines','sensors','sensing_links'})
        self.assertEqual(len(data['templates']), 3)
        sensor = data['sensors'][0]
        self.assertNotIn('key_hash', sensor)
        self.assertNotIn('test-only-key', str(data))
        self.assertEqual(self.client.patch('/api/console/sensors/csi-rx-01', json={'bound_machine_id':'bad'}).status_code, 405)
        self.assertEqual(self.client.get('/api/metrics/step-durations').status_code, 501)

    def test_machine_crud_and_failed_mutation(self):
        machine = self.machine()
        url = '/api/console/machines/' + machine['id']
        result = self.client.patch(url, json={'profile_id':'prf-picker-1'})
        self.assertEqual(result.status_code, 422)
        self.assertEqual(result.json()['code'], 'profile_kind_mismatch')
        self.assertEqual(self.client.get(url).json()['profile_id'], 'prf-press-1')
        self.assertEqual(self.client.patch(url, json={'name':None}).status_code, 422)
        self.assertEqual(self.client.patch(url, json={'operating_status':'STOPPED'}).json()['operating_status'], 'STOPPED')
        self.assertEqual(self.client.get('/api/state').json()['machine']['status'], 'IDLE')
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_immutable_versions_and_calibration(self):
        profile = self.client.post('/api/console/profiles', json={'template_id':'tpl-press','name':'Custom'}).json()
        url = '/api/console/profiles/' + profile['id']
        first = self.client.get(url+'/versions').json()[0]
        phases = [dict(id='new',name='New',expected_activity=.4,duration_ticks=5)]
        second = self.client.post(url+'/versions', json={'phases':phases}).json()
        self.assertEqual(second['version'], 2)
        self.assertEqual(self.client.get(url+'/versions').json()[0], first)
        self.assertEqual(self.client.patch(url+'/versions/'+first['id'], json={'phases':phases}).json()['code'], 'immutable_version')
        self.assertEqual(self.client.post(url+'/versions').json()['version'], 3)
        machine = self.machine(profile_id=profile['id'])
        body = dict(profile_id=profile['id'],profile_version_id=second['id'],machine_id=machine['id'],state='calibrating')
        before = self.client.post('/api/console/calibrations', json=body).json()
        body['state'] = 'calibrated'
        after = self.client.post('/api/console/calibrations', json=body).json()
        self.assertEqual(after['version'], before['version']+1)
        self.assertEqual(self.client.post('/api/console/calibrations', json=body).json()['version'], after['version'])

    def test_links_ambiguity_and_sensor_ingest_mapping(self):
        one, two = self.machine(), self.machine(name='Press-02')
        body = dict(name='Shared', mode='dedicated',zone_id='zone-a',machine_ids=[one['id'],two['id']],physical_sensor_id='csi-rx-01')
        result = self.client.post('/api/console/sensing-links', json=body)
        self.assertEqual(result.json()['code'], 'dedicated_link_requires_one_machine')
        body['mode'] = 'shared_zone'
        link = self.client.post('/api/console/sensing-links', json=body).json()
        self.assertEqual(link['ambiguity']['level'], 'high')
        self.assertIn(link['id'], self.client.get('/api/console/machines/'+one['id']).json()['sensor_link_ids'])
        body.update(mode='dedicated', machine_ids=[one['id']])
        result = self.client.put('/api/console/sensing-links/'+link['id'], json=body).json()
        self.assertIn('does not provide perfect', result['ambiguity']['summary'])
        event = main.envelope('ACTIVITY_LEVEL',dict(activity_score=.1,baseline=0,method='wifi_csi'),'sensor')
        event['machine_id'] = one['id']
        self.assertEqual(self.client.post('/api/events',json=event,headers={'X-Sensor-Id':'csi-rx-01','X-Sensor-Key':'test-only-key'}).status_code,403)
        self.client.delete('/api/console/machines/'+one['id'])
        self.assertEqual(self.client.get('/api/console/sensing-links').json(), [])

    def test_tenant_and_roles_including_briefings(self):
        machine = self.machine()
        event = main.envelope('ACTIVITY_DETECTED',dict(activity_score=.6,threshold=.2,method='wifi_csi'),'sensor')
        self.client.post('/api/events',json=event,headers={'X-Sensor-Id':'csi-rx-01','X-Sensor-Key':'test-only-key'})
        alert_id = self.client.get('/api/alerts').json()[0]['alert_id']
        identity = auth.Identity(dict(id='other',name='Other',email=None),dict(id='other-co',name='Other Co'),'operator')
        with patch('backend.auth.authenticate', return_value=identity):
            self.assertEqual(self.client.get('/api/console/catalog').json()['machines'], [])
            self.assertEqual(self.client.get('/api/console/machines/'+machine['id']).status_code,404)
            self.assertEqual(self.client.post('/api/console/machines',json={}).status_code,403)
            self.assertEqual(self.client.delete('/api/console/machines/'+machine['id']).status_code,403)
            self.assertEqual(self.client.post('/api/alerts/other/voice').status_code,404)
            self.assertEqual(self.client.post('/api/alerts/'+alert_id+'/ack').status_code,404)
            self.assertEqual(self.client.post('/api/alerts/'+alert_id+'/voice').status_code,404)
            self.assertEqual(self.client.post('/api/alerts/'+alert_id+'/explain').status_code,404)
            self.assertEqual(self.client.get('/api/alerts').json(),[])
            self.assertEqual(self.client.get('/api/events').json(),[])
            self.assertEqual(self.client.get('/api/state').status_code,404)
            with self.assertRaises(WebSocketDisconnect) as caught:
                with self.client.websocket_connect('/ws') as ws:
                    ws.receive_json()
            self.assertEqual(caught.exception.code,4403)

    def test_local_auth_bypass_is_not_available_to_remote_clients(self):
        with TestClient(main.app, client=('192.0.2.10',12345)) as remote:
            self.assertEqual(remote.get('/api/me').status_code,403)
            self.assertEqual(remote.get('/health').status_code,200)
            # Hardware ingest remains independent of browser authentication.
            event=main.envelope('ACTIVITY_LEVEL',dict(activity_score=.1,baseline=0,method='wifi_csi'),'sensor')
            self.assertEqual(remote.post('/api/events',json=event,headers={'X-Sensor-Id':'csi-rx-01','X-Sensor-Key':'test-only-key'}).status_code,202)

    def test_only_internal_machine_events_can_report_machine_failure(self):
        delayed = main.envelope('STEP_COMPLETED',dict(step='PICK',cycle_id=1,duration_ms=4000,expected_ms=2000),'machine')
        main.hub.atomic(lambda: main.hub.machine_event(delayed))
        self.assertEqual(self.client.get('/api/alerts').json()[0]['rule'],'STEP_DELAY')
        failed = main.envelope('STEP_FAILED',dict(step='PICK',cycle_id=1,reason='Explicit simulated failure'),'machine')
        main.hub.atomic(lambda: main.hub.machine_event(failed))
        self.assertEqual(self.client.get('/api/alerts').json()[0]['rule'],'STEP_FAILURE')
        self.assertEqual(self.client.get('/api/state').json()['machine']['status'],'FAULT')
