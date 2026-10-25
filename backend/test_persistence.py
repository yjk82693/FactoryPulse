"""Real PostgreSQL tests. TEST_DATABASE_URL must point to a disposable test server.

Each run creates a random isolated schema and removes only that schema afterwards.
No production schema or resources are modified.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from fastapi.testclient import TestClient
from backend import main
from backend.repository import Repository


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Set TEST_DATABASE_URL for real PostgreSQL verification')
class PersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = os.environ['TEST_DATABASE_URL']
        cls.schema = 'factory_test_' + uuid4().hex
        with psycopg.connect(cls.base) as conn:
            conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(cls.schema)))
        cls.url = make_conninfo(cls.base, options=f'-csearch_path={cls.schema},public')

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(cls.base) as conn:
            conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(cls.schema)))

    def setUp(self):
        self.env = patch.dict(os.environ,dict(DATABASE_URL=self.url,AUTH_DISABLED='true',SIM_ENABLED='false',SENSOR_INGEST_KEY='test-only-key'))
        self.env.start()
        main.hub = main.Hub()

    def tearDown(self):
        self.env.stop()

    def test_restart_history_ack_and_database_dedup(self):
        event = main.envelope('ACTIVITY_DETECTED',dict(activity_score=.6,threshold=.2,method='wifi_csi'),'sensor')
        headers = {'X-Sensor-Id':'csi-rx-01','X-Sensor-Key':'test-only-key'}
        with TestClient(main.app) as client:
            machine = client.post('/api/console/machines',json=dict(name='Persistent',kind='press',zone_id='zone-a',operating_status='IDLE',profile_id='prf-press-1')).json()
            self.assertEqual(client.post('/api/events',json=event,headers=headers).status_code,202)
            alert = next(a for a in client.get('/api/alerts').json() if event['event_id'] in a['related_event_ids'])
            self.assertTrue(client.post('/api/alerts/'+alert['alert_id']+'/ack').json()['acknowledged'])
            self.assertEqual(client.get('/api/state').json()['server']['persistence'],'tiger_data')
            version = client.get('/api/console/profiles/prf-press-1/versions').json()[0]
            calibration = client.post('/api/console/calibrations',json=dict(profile_id='prf-press-1',profile_version_id=version['id'],machine_id=machine['id'],state='calibrated',notes='Synthetic baseline')).json()
            link = client.post('/api/console/sensing-links',json=dict(name='Persistent link',mode='dedicated',zone_id='zone-a',machine_ids=[machine['id']],physical_sensor_id='csi-rx-01')).json()
        main.hub = main.Hub()
        with TestClient(main.app) as client:
            self.assertEqual(client.get('/api/console/machines/'+machine['id']).status_code,200)
            restored = next(a for a in client.get('/api/alerts?status=all').json() if a['alert_id']==alert['alert_id'])
            self.assertTrue(restored['acknowledged'])
            self.assertEqual(restored['acknowledged_by'],'dev-user')
            catalog = client.get('/api/console/catalog').json()
            self.assertIn(calibration,catalog['calibrations'])
            self.assertIn(link,catalog['sensing_links'])
            # AI context is recovered from persistent history beyond the memory ring.
            main.hub.events.clear()
            context = main.app.state.repository.briefing_context('demo-co',alert['alert_id'],main.hub)
            self.assertEqual(context.events[0]['event_id'],event['event_id'])
            self.assertEqual(client.post('/api/alerts/'+alert['alert_id']+'/explain').status_code,501)
            main.hub.ids.clear()
            main.hub.seen.clear()  # Exercise persistent dedup independently of memory.
            result = client.post('/api/events',json=event,headers=headers).json()
            self.assertFalse(result['accepted'])
            self.assertFalse(result['duplicate'])  # v1.2 flag reflects the memory check only.
            with main.app.state.repository.connect() as conn:
                self.assertEqual(conn.execute('SELECT count(*) FROM events WHERE event_id=%s',(event['event_id'],)).fetchone()[0],1)
                sensor = conn.execute('SELECT key_hash,data FROM physical_sensors').fetchone()
                self.assertEqual(len(sensor[0]),64)
                self.assertNotIn('test-only-key', str(sensor))

    def test_atomic_failure_has_no_state_history_or_broadcast(self):
        event = main.envelope('ACTIVITY_LEVEL',dict(activity_score=.9,baseline=0,method='wifi_csi'),'sensor')
        with TestClient(main.app) as client:
            queue = asyncio.Queue(maxsize=256)
            main.hub.clients.add(queue)
            before = main.hub.sensor.copy()
            with patch.object(main.app.state.repository,'save_live',side_effect=psycopg.OperationalError('test failure')):
                response = client.post('/api/events',json=event,headers={'X-Sensor-Id':'csi-rx-01','X-Sensor-Key':'test-only-key'})
            self.assertEqual(response.status_code,503)
            self.assertEqual(main.hub.sensor,before)
            # Ticker may emit state; a failed transaction must never emit its event.
            while not queue.empty():
                self.assertNotEqual(queue.get_nowait().get('type'),'event')
            with main.app.state.repository.connect() as conn:
                self.assertEqual(conn.execute('SELECT count(*) FROM event_ids WHERE event_id=%s',(event['event_id'],)).fetchone()[0],0)
            main.hub.clients.discard(queue)

    def test_concurrent_versions_and_tenant_references(self):
        with TestClient(main.app) as client:
            profile = client.post('/api/console/profiles',json=dict(template_id='tpl-press',name='Concurrent')).json()
            url = '/api/console/profiles/'+profile['id']+'/versions'
            with ThreadPoolExecutor(max_workers=4) as pool:
                responses = list(pool.map(lambda _: client.post(url), range(6)))
            self.assertTrue(all(r.status_code==201 for r in responses), [r.text for r in responses])
            self.assertEqual([v['version'] for v in client.get(url).json()],list(range(1,8)))
            repo = main.app.state.repository
            with repo.connect() as conn:
                conn.execute("INSERT INTO companies VALUES ('other-co','Other') ON CONFLICT DO NOTHING")
            with repo.catalog('other-co') as catalog:
                self.assertEqual(catalog['profiles'],[])
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                with repo.catalog('other-co',True) as catalog:
                    catalog['machines'].append(dict(id=str(uuid4()),profile_id=profile['id'],zone_id='zone-a'))
            with self.assertRaises(psycopg.errors.RaiseException):
                with repo.connect() as conn:
                    conn.execute('UPDATE console_profile_versions SET data=data WHERE company_id=%s AND profile_id=%s',('demo-co',profile['id']))

    def test_memberships_and_hourly_metrics(self):
        with TestClient(main.app) as client:
            repo = main.app.state.repository
            member = repo.identity('auth0|dbtest', True)
            self.assertEqual(member['role'],'operator')
            self.assertEqual(Repository(self.url).identity('auth0|dbtest')['user']['id'],member['user']['id'])
            main.hub.atomic(lambda: main.hub.machine_event(main.envelope('STEP_COMPLETED',dict(step='PICK',cycle_id=1,duration_ms=3000,expected_ms=2000),'machine')))
            metrics = client.get('/api/metrics/step-durations').json()
            self.assertEqual(metrics[0]['avg_ms'],3000)
            self.assertTrue(metrics[0]['bucket'].endswith('Z'))

    def test_one_live_process_and_repeatable_migrations(self):
        with TestClient(main.app):
            repo = Repository(self.url)
            repo.initialize()
            with self.assertRaises(RuntimeError):
                repo.acquire_live_owner()
