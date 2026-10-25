import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend import auth, main
from backend.repository import Repository


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537,key_size=2048)

    def setUp(self):
        self.env = patch.dict(os.environ,dict(AUTH_DISABLED='false',AUTH0_DOMAIN='tenant.auth0.com',AUTH0_AUDIENCE='factory-api',SIM_ENABLED='false',SENSOR_INGEST_KEY='test-only-key',DATABASE_URL='',DEMO_AUTO_JOIN='false'))
        self.env.start()
        self.jwks = patch('backend.auth.jwks', return_value=SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=self.key.public_key())))
        self.jwks.start()
        self.repo = Repository()

    def tearDown(self):
        self.jwks.stop()
        self.env.stop()

    def token(self, **changes):
        claims = dict(sub='auth0|one',iss='https://tenant.auth0.com/',aud='factory-api',exp=int(time.time())+120)
        claims.update(changes)
        return jwt.encode(claims,self.key,algorithm='RS256')

    def test_signature_issuer_audience_expiration(self):
        for changes in [dict(iss='bad'),dict(aud='bad'),dict(exp=1),dict(sub='')]:
            with self.assertRaises(HTTPException) as caught:
                auth.authenticate(self.token(**changes), self.repo)
            self.assertEqual(caught.exception.status_code,401)
        wrong = rsa.generate_private_key(public_exponent=65537,key_size=2048)
        with self.assertRaises(HTTPException) as caught:
            auth.authenticate(jwt.encode(dict(sub='one',iss='https://tenant.auth0.com/',aud='factory-api',exp=time.time()+60),wrong,algorithm='RS256'),self.repo)
        self.assertEqual(caught.exception.status_code,401)
        with self.assertRaises(HTTPException) as caught:
            auth.authenticate(self.token(), self.repo)
        self.assertEqual(caught.exception.status_code,403)
        missing_exp = dict(sub='one',iss='https://tenant.auth0.com/',aud='factory-api')
        for token in [jwt.encode(missing_exp,self.key,algorithm='RS256'),
                      jwt.encode(dict(**missing_exp,exp=time.time()+60),'not-an-rsa-key-but-long-enough-for-test',algorithm='HS256')]:
            with self.assertRaises(HTTPException) as caught:
                auth.authenticate(token,self.repo)
            self.assertEqual(caught.exception.status_code,401)

    def test_rest_and_ws(self):
        main.hub = main.Hub()
        with TestClient(main.app) as client:
            self.assertEqual(client.get('/api/state').status_code,401)
            self.assertEqual(client.get('/api/console/catalog').status_code,401)
            self.assertEqual(client.post('/api/alerts/x/explain').status_code,401)
            with self.assertRaises(WebSocketDisconnect) as caught:
                with client.websocket_connect('/ws') as ws:
                    ws.send_json(dict(type='auth',token='broken'))
                    ws.receive_json()
            self.assertEqual(caught.exception.code,4401)
            with self.assertRaises(WebSocketDisconnect) as caught:
                with client.websocket_connect('/ws') as ws:
                    ws.send_json(dict(type='auth',token=self.token()))
                    ws.receive_json()
            self.assertEqual(caught.exception.code,4403)
            with patch.dict(os.environ, {'DEMO_AUTO_JOIN':'true'}):
                headers={'Authorization':'Bearer '+self.token()}
                self.assertEqual(client.get('/api/me',headers=headers).json()['role'],'operator')
                self.assertEqual(client.post('/api/console/profiles',headers=headers,json=dict(template_id='tpl-press',name='Denied')).status_code,403)
                with client.websocket_connect('/ws') as ws:
                    ws.send_json(dict(type='auth',token=self.token()))
                    self.assertEqual(ws.receive_json()['type'],'ready')
                    self.assertEqual(ws.receive_json()['type'],'state')

    def test_configuration_fails_closed(self):
        with patch.dict(os.environ, {'AUTH0_AUDIENCE':''}):
            with self.assertRaises(RuntimeError):
                auth.validate_config()
        with patch.dict(os.environ, {'AUTH_DISABLED':'true','APP_ENV':'production'}):
            with self.assertRaises(RuntimeError):
                auth.validate_config()
