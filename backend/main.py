"""Local development backend for the existing FactoryPulse React contract."""
import asyncio
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import os
import logging
from copy import deepcopy
from contextvars import ContextVar
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime

from backend.envload import load_backend_env

load_backend_env()

from backend.ai.config import briefing_flags
from backend.ai.routes import create_briefing_router
from backend import auth
from backend.repository import Repository
from backend.console import router as console_router
from backend.common import fail


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


class Level(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    activity_score: float = Field(ge=0, le=1)
    method: Literal['wifi_csi', 'simulated']
    baseline: float


class Detected(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    activity_score: float = Field(ge=0, le=1)
    method: Literal['wifi_csi', 'simulated']
    threshold: float = Field(ge=0, le=1)


class Cleared(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    activity_score: float = Field(ge=0, le=1)
    method: Literal['wifi_csi', 'simulated']


class Event(BaseModel):
    model_config = ConfigDict(extra='forbid')
    event_id: UUID
    timestamp: AwareDatetime
    source: str
    event_type: str
    machine_id: str
    payload: dict


def envelope(kind, payload, source='system'):
    return dict(event_id=str(uuid4()), timestamp=now(), source=source,
                event_type=kind, machine_id='assembly_01', payload=payload)


class Hub:
    def __init__(self, company=None, repository=None):
        self.company = company or dict(id='demo-co', name='Demo Manufacturing')
        self.repository = repository
        self.conn = None
        self.outbox = None
        self.clients = set()
        self.events = deque(maxlen=10000)
        self.ids = deque()
        self.seen = set()
        self.alerts = deque()
        self.review_cycle = None
        self.last_sensor = 0
        self.machine = dict(machine_id='assembly_01', status='IDLE', current_step=None,
                            cycle_id=0, step_started_at=None, simulated=True)
        if self.company['id'] != 'demo-co':
            self.machine.update(machine_id=None, simulated=False)
        self.sensor = dict(activity_score=0., active=False, method='wifi_csi',
                           last_update_at=None, connected=False)

    def state(self):
        return dict(server=dict(auth_mode='disabled' if auth.disabled() else 'auth0',
                                persistence=self.repository.mode if self.repository else 'memory',
                                console_enabled=True, **briefing_flags()),
                    company=self.company, machine=self.machine,
                    sensor=self.sensor, alerts=[a for a in self.alerts if not a['acknowledged']] +
                    [a for a in self.alerts if a['acknowledged']][:20], recent_events=list(self.events)[:50])

    def broadcast(self, kind, data):
        if self.outbox is not None:
            self.outbox.append((kind, deepcopy(data)))
            return
        for queue in tuple(self.clients):
            try:
                queue.put_nowait(dict(type=kind, data=data))
            except asyncio.QueueFull:
                self.clients.discard(queue)

    def record(self, event):
        if self.repository and not self.repository.record_event(self.company['id'], event, self.conn):
            return False
        self.events.appendleft(event)
        self.broadcast('event', event)
        return True

    def atomic(self, action):
        """Commit durable history and state before publishing any live messages."""
        if not self.repository:
            return action()
        fields = ('events', 'ids', 'seen', 'alerts', 'review_cycle', 'last_sensor', 'machine', 'sensor')
        snapshot = {field: deepcopy(getattr(self, field)) for field in fields}
        self.outbox = []
        try:
            with self.repository.live_transaction(self.company['id']) as conn:
                self.conn = conn
                result = action()
                self.repository.save_live(self.company['id'], self, conn)
            messages = self.outbox
        except Exception:
            for field, value in snapshot.items():
                setattr(self, field, value)
            raise
        finally:
            self.conn = None
            self.outbox = None
        for kind, data in messages:
            self.broadcast(kind, data)
        return result

    def ingest(self, event):
        eid = event['event_id']
        if eid in self.seen:
            return False
        if not self.record(event):
            return False
        if len(self.ids) == 10000:
            self.seen.remove(self.ids.popleft())
        self.ids.append(eid)
        self.seen.add(eid)
        payload = event['payload']
        self.last_sensor = asyncio.get_running_loop().time()
        self.sensor.update(activity_score=payload['activity_score'], method=payload['method'],
                           last_update_at=event['timestamp'], connected=True)
        kind = event['event_type']
        if kind != 'ACTIVITY_LEVEL':
            self.sensor['active'] = kind == 'ACTIVITY_DETECTED'
        if kind == 'ACTIVITY_DETECTED' and self.machine['status'] != 'MAINTENANCE':
            review = self.machine['current_step'] == 'ASSEMBLE'
            cycle = self.machine['cycle_id']
            if not review or self.review_cycle != cycle:
                if review:
                    self.review_cycle = cycle
                alert = dict(alert_id=str(uuid4()), rule='ACTIVITY_REVIEW' if review else 'ACTIVITY_INFO',
                             severity='warning' if review else 'info',
                             message='Activity detected near the cell during ASSEMBLE. Operator review recommended.'
                             if review else 'Activity detected near the cell.', created_at=now(),
                             cycle_id=cycle, acknowledged=False, acknowledged_by=None,
                             acknowledged_at=None, related_event_ids=[eid])
                self.alerts.appendleft(alert)
                self.record(envelope('ALERT_CREATED', {k: alert[k] for k in
                            ('alert_id', 'rule', 'severity', 'message', 'related_event_ids')}))
                self.broadcast('alert', alert)
        return True

    def machine_event(self, event):
        """Internal-only machine events; never infer a machine failure from CSI."""
        if not self.record(event):
            return False
        kind, payload = event['event_type'], event['payload']
        if kind == 'STEP_STARTED':
            self.machine.update(status='RUNNING', current_step=payload['step'],
                                cycle_id=payload['cycle_id'], step_started_at=event['timestamp'])
        rule = None
        if kind == 'STEP_FAILED':
            rule, severity, message = 'STEP_FAILURE', 'critical', f"Simulated machine step {payload['step']} failed: {payload['reason']}"
            self.machine['status'] = 'FAULT'
        elif kind == 'STEP_COMPLETED' and payload['duration_ms'] > 1.5 * payload['expected_ms']:
            rule, severity, message = 'STEP_DELAY', 'warning', f"Simulated machine step {payload['step']} exceeded its expected duration."
        if rule:
            alert = dict(alert_id=str(uuid4()), rule=rule, severity=severity, message=message, created_at=now(),
                         cycle_id=payload['cycle_id'], acknowledged=False, acknowledged_by=None,
                         acknowledged_at=None, related_event_ids=[event['event_id']])
            self.alerts.appendleft(alert)
            self.record(envelope('ALERT_CREATED', {k: alert[k] for k in ('alert_id','rule','severity','message','related_event_ids')}))
            self.broadcast('alert', alert)
        return True


COMPANY = dict(id='demo-co', name='Demo Manufacturing')
USER = dict(id='dev-user', name='Dev User')
hub = Hub()
tenant_hubs = {}


def get_hub(identity):
    if identity.company['id'] == 'demo-co':
        return hub
    cid = identity.company['id']
    if cid not in tenant_hubs:
        tenant_hubs[cid] = Hub(identity.company, app.state.repository)
        app.state.repository.restore_live(cid, tenant_hubs[cid])
    return tenant_hubs[cid]


briefing_hub = ContextVar('briefing_hub')


async def briefing_access(request: Request):
    identity = await asyncio.to_thread(auth.current, request)
    current_hub = get_hub(identity)
    context = await asyncio.to_thread(request.app.state.repository.briefing_context,
                                      identity.company['id'], request.path_params['alert_id'], current_hub)
    token = briefing_hub.set(context)
    try:
        yield
    finally:
        briefing_hub.reset(token)


async def ticker():
    elapsed = 0
    while True:
        await asyncio.sleep(.25)
        elapsed += 1
        for current_hub in [hub, *tenant_hubs.values()]:
            if asyncio.get_running_loop().time() - current_hub.last_sensor > 5:
                current_hub.sensor.update(connected=False, active=False)
            current_hub.broadcast('state', current_hub.state())
            if elapsed % 80 == 0:
                for queue in tuple(current_hub.clients):
                    if not queue.full():
                        queue.put_nowait(dict(type='ping'))


async def simulator():
    durations = dict(PICK=2000, MOVE=3000, ASSEMBLE=5000, RETURN=2000)

    async def persist(event):
        while True:
            try:
                hub.atomic(lambda: hub.machine_event(event))
                return
            except psycopg.Error:
                logging.error('Simulator persistence unavailable; retrying without publishing uncommitted events')
                await asyncio.sleep(2)

    while True:
        cycle_id = hub.machine['cycle_id'] + 1
        for step, duration in durations.items():
            payload = dict(step=step, cycle_id=cycle_id)
            await persist(envelope('STEP_STARTED', payload, 'machine'))
            await asyncio.sleep(duration / 1000)
            await persist(envelope('STEP_COMPLETED', dict(**payload, duration_ms=duration,
                                                       expected_ms=duration), 'machine'))


@asynccontextmanager
async def lifespan(app):
    auth.validate_config()
    if not os.getenv('SENSOR_INGEST_KEY'):
        raise RuntimeError('Set SENSOR_INGEST_KEY before starting.')
    if auth.disabled():
        logging.warning('Local development: dashboard authentication is disabled.')
    repository = Repository(os.getenv('DATABASE_URL') or None)
    tasks = []
    try:
        repository.initialize()
        repository.acquire_live_owner()
        repository.provision_sensor()
        app.state.repository = repository
        hub.repository = repository
        tenant_hubs.clear()
        repository.restore_live('demo-co', hub)
        tasks = [asyncio.create_task(ticker())]
        if os.getenv('SIM_ENABLED', 'true').lower() == 'true':
            tasks.append(asyncio.create_task(simulator()))
        yield
    finally:
        for task in tasks:
            task.cancel()
        try:
            for task in tasks:
                with suppress(asyncio.CancelledError):
                    await task
        finally:
            repository.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allow_headers=['*'])
# C-owned briefing routes (Gemini / ElevenLabs). Ingest, WS, and Console CRUD remain B-owned.
app.include_router(create_briefing_router(lambda: briefing_hub.get()), dependencies=[Depends(briefing_access)])
app.include_router(console_router)


LOCAL_HOSTS = {'127.0.0.1', '::1', 'localhost', 'testclient'}


@app.middleware('http')
async def local_dev_only(request: Request, call_next):
    if (request.url.path not in ('/api/events', '/health') and auth.disabled()
            and request.client and request.client.host not in LOCAL_HOSTS):
        return JSONResponse(dict(detail='Development auth bypass is local only', code='forbidden'), status_code=403)
    return await call_next(request)


@app.exception_handler(StarletteHTTPException)
async def error_handler(request, exc):
    from fastapi.responses import JSONResponse
    codes = {401:'unauthenticated',403:'forbidden',404:'not_found',422:'validation_error'}
    detail = exc.detail if isinstance(exc.detail, dict) else dict(detail=exc.detail, code=codes.get(exc.status_code,'request_failed'))
    return JSONResponse(detail, status_code=exc.status_code, headers=exc.headers)


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(dict(detail='Invalid request fields', code='validation_error'), status_code=422)


import psycopg


@app.exception_handler(psycopg.Error)
async def database_error(request, exc):
    # Do not leak DSNs, SQL, credentials, or cross-tenant constraint details.
    return JSONResponse(dict(detail='Persistent storage is unavailable', code='persistence_unavailable'), status_code=503)


@app.get('/health')
def health():
    return dict(status='ok')


@app.get('/api/me')
def me(identity=Depends(auth.current)):
    return dict(user=identity.user, company=identity.company, role=identity.role)


@app.get('/api/state')
def state(identity=Depends(auth.current)):
    if identity.company['id'] != 'demo-co':
        fail(404, 'not_found', 'No live cell configured for this company')
    return get_hub(identity).state()


@app.post('/api/events', status_code=202)
async def ingest(event: Event, x_sensor_id: str = Header(default=''), x_sensor_key: str = Header(default='')):
    repository = app.state.repository
    if (x_sensor_id != repository.sensor_id or
            not hmac.compare_digest(hashlib.sha256(x_sensor_key.encode()).digest(),
                                    bytes.fromhex(repository.sensor_hash))):
        raise HTTPException(401, dict(detail='Invalid sensor credentials', code='unauthenticated'))
    models = dict(ACTIVITY_LEVEL=Level, ACTIVITY_DETECTED=Detected, ACTIVITY_CLEARED=Cleared)
    if event.source != 'sensor' or event.machine_id != 'assembly_01' or event.event_type not in models:
        raise HTTPException(403, 'Sensor event not allowed')
    if event.timestamp > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(422, 'Timestamp too far in future')
    from pydantic import ValidationError
    try:
        models[event.event_type].model_validate(event.payload)
    except ValidationError:
        raise HTTPException(422, 'Invalid sensor payload')
    wire = event.model_dump(mode='json')
    wire['timestamp'] = event.timestamp.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    duplicate = wire['event_id'] in hub.seen
    accepted = hub.atomic(lambda: hub.ingest(wire))
    return dict(accepted=accepted, duplicate=duplicate)


@app.get('/api/events')
def events(limit: int = 100, before: AwareDatetime | None = None, identity=Depends(auth.current)):
    current_hub = get_hub(identity)
    limit = max(0, min(limit, 10000))
    if app.state.repository.url:
        return app.state.repository.event_history(identity.company['id'], limit, before)
    items = sorted(current_hub.events, key=lambda e: datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')), reverse=True)
    if before:
        items = [e for e in items if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) < before]
    return items[:max(0, min(limit, 10000))]


@app.get('/api/alerts')
def alerts(status: Literal['open', 'all'] = 'open', identity=Depends(auth.current)):
    return [a for a in get_hub(identity).alerts if status == 'all' or not a['acknowledged']]


@app.post('/api/alerts/{alert_id}/ack')
async def acknowledge(alert_id: str, identity=Depends(auth.current)):
    current_hub = get_hub(identity)
    for alert in current_hub.alerts:
        if alert['alert_id'] == alert_id:
            if not alert['acknowledged']:
                def apply_ack():
                    alert.update(acknowledged=True, acknowledged_by=identity.user['id'], acknowledged_at=now())
                    current_hub.record(envelope('ALERT_ACKNOWLEDGED', dict(alert_id=alert_id, acknowledged_by=identity.user['id'])))
                    current_hub.broadcast('alert', alert)
                current_hub.atomic(apply_ack)
            return alert
    raise HTTPException(404, dict(detail='Alert not found', code='alert_not_found'))


@app.get('/api/metrics/step-durations')
def metrics(identity=Depends(auth.current)):
    if not app.state.repository.url:
        fail(501, 'metrics_unavailable', 'Database required for historical metrics')
    return app.state.repository.metrics(identity.company['id'])


@app.websocket('/ws')
async def websocket(socket: WebSocket):
    if auth.disabled() and socket.client and socket.client.host not in LOCAL_HOSTS:
        await socket.close(code=4403)
        return
    await socket.accept()
    try:
        token = ''
        if not auth.disabled():
            message = await asyncio.wait_for(socket.receive_json(), timeout=5)
            if not isinstance(message, dict) or message.get('type') != 'auth' or not isinstance(message.get('token'), str):
                fail(401, 'unauthenticated', 'Auth message required')
            token = message['token']
        identity = await asyncio.to_thread(auth.authenticate, token, app.state.repository)
    except HTTPException as exc:
        await socket.close(code=4403 if exc.status_code == 403 else 4401)
        return
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        with suppress(RuntimeError):
            await socket.close(code=4401)
        return
    current_hub = get_hub(identity)
    if identity.company['id'] != 'demo-co':
        await socket.close(code=4403)
        return
    queue = asyncio.Queue(maxsize=256)
    # No await between snapshot and subscription: ready/state always precede deltas.
    current_hub.clients.add(queue)
    try:
        await socket.send_json(dict(type='ready', data=dict(auth_mode='disabled' if auth.disabled() else 'auth0',
                                                           user={k: identity.user[k] for k in ('id', 'name')}, company=identity.company)))
        await socket.send_json(dict(type='state', data=current_hub.state()))
        while queue in current_hub.clients:
            message = await asyncio.wait_for(queue.get(), timeout=25)
            await asyncio.wait_for(socket.send_json(message), timeout=5)
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
        pass
    finally:
        current_hub.clients.discard(queue)
        with suppress(RuntimeError):
            await socket.close()
