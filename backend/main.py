"""Local development backend for the existing FactoryPulse React contract."""
import asyncio
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import os
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime

from backend.ai.config import briefing_flags
from backend.ai.routes import create_briefing_router


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
    def __init__(self):
        self.clients = set()
        self.events = deque(maxlen=10000)
        self.ids = deque()
        self.seen = set()
        self.alerts = deque(maxlen=200)
        self.review_cycle = None
        self.last_sensor = 0
        self.machine = dict(machine_id='assembly_01', status='IDLE', current_step=None,
                            cycle_id=0, step_started_at=None, simulated=True)
        self.sensor = dict(activity_score=0., active=False, method='wifi_csi',
                           last_update_at=None, connected=False)

    def state(self):
        return dict(server=dict(auth_mode='disabled', persistence='memory', **briefing_flags()),
                    company=COMPANY, machine=self.machine,
                    sensor=self.sensor, alerts=list(self.alerts), recent_events=list(self.events)[:50])

    def broadcast(self, kind, data):
        for queue in tuple(self.clients):
            try:
                queue.put_nowait(dict(type=kind, data=data))
            except asyncio.QueueFull:
                self.clients.discard(queue)

    def record(self, event):
        self.events.appendleft(event)
        self.broadcast('event', event)

    def ingest(self, event):
        eid = event['event_id']
        if eid in self.seen:
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
        self.record(event)
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


COMPANY = dict(id='demo-co', name='Demo Manufacturing')
USER = dict(id='dev-user', name='Dev User')
hub = Hub()


async def ticker():
    elapsed = 0
    while True:
        await asyncio.sleep(.25)
        elapsed += 1
        if asyncio.get_running_loop().time() - hub.last_sensor > 5:
            hub.sensor.update(connected=False, active=False)
        hub.broadcast('state', hub.state())
        if elapsed % 80 == 0:
            for queue in tuple(hub.clients):
                if not queue.full():
                    queue.put_nowait(dict(type='ping'))


async def simulator():
    durations = dict(PICK=2000, MOVE=3000, ASSEMBLE=5000, RETURN=2000)
    while True:
        hub.machine['cycle_id'] += 1
        for step, duration in durations.items():
            hub.machine.update(status='RUNNING', current_step=step, step_started_at=now())
            payload = dict(step=step, cycle_id=hub.machine['cycle_id'])
            hub.record(envelope('STEP_STARTED', payload, 'machine'))
            await asyncio.sleep(duration / 1000)
            hub.record(envelope('STEP_COMPLETED', dict(**payload, duration_ms=duration,
                                                       expected_ms=duration), 'machine'))


@asynccontextmanager
async def lifespan(app):
    if os.getenv('AUTH_DISABLED', '').lower() != 'true':
        raise RuntimeError('This local backend requires explicit AUTH_DISABLED=true; Auth0 is not implemented.')
    if not os.getenv('SENSOR_INGEST_KEY'):
        raise RuntimeError('Set SENSOR_INGEST_KEY before starting.')
    print('WARNING: local development backend; dashboard authentication is disabled.')
    tasks = [asyncio.create_task(ticker())]
    if os.getenv('SIM_ENABLED', 'true').lower() == 'true':
        tasks.append(asyncio.create_task(simulator()))
    yield
    for task in tasks:
        task.cancel()
    for task in tasks:
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST'], allow_headers=['*'])
# C-owned briefing routes (Gemini / ElevenLabs). Ingest, WS, and Console CRUD remain B-owned.
app.include_router(create_briefing_router(lambda: hub))


@app.exception_handler(HTTPException)
async def error_handler(request, exc):
    from fastapi.responses import JSONResponse
    detail = exc.detail if isinstance(exc.detail, dict) else dict(detail=exc.detail, code='request_failed')
    return JSONResponse(detail, status_code=exc.status_code)


@app.get('/health')
def health():
    return dict(status='ok')


@app.get('/api/me')
def me():
    return dict(user=dict(**USER, email=None), company=COMPANY, role='supervisor')


@app.get('/api/state')
def state():
    return hub.state()


@app.post('/api/events', status_code=202)
async def ingest(event: Event, x_sensor_id: str = Header(default=''), x_sensor_key: str = Header(default='')):
    expected = os.getenv('SENSOR_INGEST_KEY', '')
    if (not expected or x_sensor_id != os.getenv('SENSOR_ID', 'csi-rx-01') or
            not hmac.compare_digest(hashlib.sha256(x_sensor_key.encode()).digest(),
                                    hashlib.sha256(expected.encode()).digest())):
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
    accepted = hub.ingest(event.model_dump(mode='json'))
    return dict(accepted=accepted, duplicate=not accepted)


@app.get('/api/events')
def events(limit: int = 100, before: AwareDatetime | None = None):
    items = list(hub.events)
    if before:
        items = [e for e in items if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) < before]
    return items[:max(0, min(limit, 10000))]


@app.get('/api/alerts')
def alerts(status: Literal['open', 'all'] = 'open'):
    return [a for a in hub.alerts if status == 'all' or not a['acknowledged']]


@app.post('/api/alerts/{alert_id}/ack')
async def acknowledge(alert_id: str):
    for alert in hub.alerts:
        if alert['alert_id'] == alert_id:
            if not alert['acknowledged']:
                alert.update(acknowledged=True, acknowledged_by=USER['id'], acknowledged_at=now())
                hub.record(envelope('ALERT_ACKNOWLEDGED', dict(alert_id=alert_id, acknowledged_by=USER['id'])))
                hub.broadcast('alert', alert)
            return alert
    raise HTTPException(404, dict(detail='Alert not found', code='alert_not_found'))


@app.websocket('/ws')
async def websocket(socket: WebSocket):
    await socket.accept()
    queue = asyncio.Queue(maxsize=256)
    # No await between snapshot and subscription: ready/state always precede deltas.
    hub.clients.add(queue)
    try:
        await socket.send_json(dict(type='ready', data=dict(auth_mode='disabled', user=USER, company=COMPANY)))
        await socket.send_json(dict(type='state', data=hub.state()))
        while queue in hub.clients:
            message = await asyncio.wait_for(queue.get(), timeout=25)
            await asyncio.wait_for(socket.send_json(message), timeout=5)
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
        pass
    finally:
        hub.clients.discard(queue)
        with suppress(RuntimeError):
            await socket.close()
