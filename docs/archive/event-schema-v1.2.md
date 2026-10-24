# FactoryPulse Contract v1.2 (source of truth)

Changes require agreement from A, B, and C. Nobody edits this file alone; proposed changes are raised with the team first.
v1.2 = v1.1 plus ElevenLabs voice alerts (sections 2, 9, 13) and capability flags in State.server.

## 1. Runtime
- Backend: http://localhost:8000. Frontend dev: http://localhost:5173 (allowed by backend CORS).
- Demo company: id "demo-co", name "Demo Manufacturing". Machine: "assembly_01" (company demo-co). Sensor: "csi-rx-01" (bound to demo-co / assembly_01).
- Timestamps: UTC ISO 8601 with "Z". IDs: UUID v4 strings.

## 2. Environment variables (values never committed; names only in .env.example)
Backend: AUTH_DISABLED (true|false), SIM_ENABLED (true|false), SIM_SEED (optional int), SENSOR_ID, SENSOR_INGEST_KEY, DATABASE_URL (optional; unset = memory only), AUTH0_DOMAIN, AUTH0_AUDIENCE, DEMO_AUTO_JOIN (true|false), GEMINI_API_KEY (optional), ELEVENLABS_API_KEY (optional), ELEVENLABS_VOICE_ID (optional), ELEVENLABS_MODEL_ID (optional; if unset, use the API default)
Sensing: BACKEND_URL, SENSOR_ID, SENSOR_INGEST_KEY, SERIAL_PORT
Frontend: VITE_DEMO_MODE (true|false), VITE_AUTH_DISABLED (true|false), VITE_API_URL, VITE_WS_URL, VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE
ElevenLabs and Gemini credentials exist only in the backend environment.

## 3. Event envelope (wire format)
```json
{
  "event_id": "uuid",
  "timestamp": "2026-10-24T18:30:00.123Z",
  "source": "machine | sensor | system",
  "event_type": "see section 4",
  "machine_id": "assembly_01",
  "payload": {}
}
```
- Extra top-level fields are rejected (422). Clients never send company_id.
- company_id is assigned by the backend (section 5), stored server-side, and not included in events sent to clients.
- The backend records received_at. Events timestamped more than 5 minutes in the future are rejected (422).

## 4. Event types and payloads
Machine (source "machine", internal simulator only):
- STEP_STARTED   { "step": Step, "cycle_id": int }
- STEP_COMPLETED { "step": Step, "cycle_id": int, "duration_ms": int, "expected_ms": int }
- STEP_FAILED    { "step": Step, "cycle_id": int, "reason": str }

Sensor (source "sensor", external sensor ingestion only):
- ACTIVITY_LEVEL    { "activity_score": float 0..1, "method": Method, "baseline": float }   about 2 per second
- ACTIVITY_DETECTED { "activity_score": float, "threshold": float, "method": Method }        rising edge
- ACTIVITY_CLEARED  { "activity_score": float, "method": Method }                            falling edge

System (source "system", created only by the backend):
- ALERT_CREATED      { "alert_id": uuid, "rule": Rule, "severity": Severity, "message": str, "related_event_ids": [uuid] }
- ALERT_ACKNOWLEDGED { "alert_id": uuid, "acknowledged_by": str }

Step = "PICK" | "MOVE" | "ASSEMBLE" | "RETURN"
Expected durations (ms): PICK 2000, MOVE 3000, ASSEMBLE 5000, RETURN 2000
Method = "wifi_csi" | "simulated"   ("simulated" = synthetic sensor data; the UI must label it)
Machine status = "IDLE" | "RUNNING" | "FAULT" | "MAINTENANCE"
Rule = "ACTIVITY_REVIEW" | "ACTIVITY_INFO" | "STEP_DELAY" | "STEP_FAILURE"
Severity = "info" | "warning" | "critical"

## 5. Ingestion paths and company assignment
Path 1, internal machine ingestion:
- The simulator runs inside the backend process and calls the ingest pipeline directly. No network endpoint accepts machine events.
- company_id comes from the backend machine registry (assembly_01 -> demo-co).

Path 2, external sensor ingestion: POST /api/events
- Headers X-Sensor-Id and X-Sensor-Key, both required; missing or wrong -> 401.
- Sensor registry: sensor_id -> { company_id, machine_id, key hash, active }.
  P0: one sensor from env (SENSOR_ID, SENSOR_INGEST_KEY) bound to demo-co / assembly_01 in backend config.
  P1 (with database): sensors table; the env sensor is upserted at startup storing only the SHA-256 hash of the key.
- Key check: constant-time comparison of SHA-256 hashes.
- Allowed only: source "sensor" AND event_type in { ACTIVITY_LEVEL, ACTIVITY_DETECTED, ACTIVITY_CLEARED }. Otherwise 403.
- machine_id must equal the sensor's bound machine_id, otherwise 403.
- company_id = the sensor's bound company_id, never taken from the request.

Path 3, system events: created only by backend rules and acknowledgement handling.

## 6. Deduplication
- Every ingested event is checked against an in-memory set of the last 10,000 event_ids. Duplicates are not re-applied to state, rules, or broadcasts.
- With a database: table event_ids (event_id UUID PRIMARY KEY, company_id TEXT, first_seen_at TIMESTAMPTZ). Persistence runs in one transaction:
  INSERT INTO event_ids ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id;
  only if a row is returned, INSERT INTO events (...).
- The events hypertable (partitioned on ts) has no unique constraint on event_id (TimescaleDB unique indexes must include the partition column); it has a non-unique index on event_id.
- The HTTP "duplicate" flag reflects the in-memory check; the event_ids table guarantees no duplicate rows across restarts.

## 7. Detection rules (backend)
- ACTIVITY_DETECTED while current_step == ASSEMBLE  -> ACTIVITY_REVIEW, warning, "Activity detected near the cell during ASSEMBLE. Operator review recommended."
- ACTIVITY_DETECTED while IDLE or another step       -> ACTIVITY_INFO, info
- ACTIVITY_DETECTED while MAINTENANCE                -> no alert
- STEP_COMPLETED with duration_ms > 1.5 x expected_ms -> STEP_DELAY, warning
- STEP_FAILED                                         -> STEP_FAILURE, critical
- At most one ACTIVITY_REVIEW per cycle_id.
- sensor.connected = false after 5 seconds without a sensor event.
Alerts are operational observations, not verified safety incidents.

## 8. Auth modes (backend)
- AUTH_DISABLED=true (local development only): every REST and WebSocket request acts as user { id "dev-user", name "Dev User" }, company demo-co, role "supervisor". Startup logs a warning.
- AUTH_DISABLED=false: Auth0 RS256 access tokens for audience AUTH0_AUDIENCE (Auth0 API identifier "https://factorypulse-api"). Validate via JWKS: signature, issuer https://{AUTH0_DOMAIN}/, audience, expiry. Identity key is "sub". users.auth0_sub -> memberships(company_id, role). Unknown user -> 403, unless DEMO_AUTO_JOIN=true (added to demo-co as operator).
- If AUTH_DISABLED=false and Auth0 settings are missing, the backend refuses to start.
- All reads, broadcasts, and alert actions are filtered by the caller's company_id.

## 9. REST
In AUTH_DISABLED=true mode, "Bearer" endpoints accept requests without a token.
Error bodies are JSON: { "detail": str, "code": str }.
- GET  /health                          no auth -> { "status": "ok" }
- POST /api/events                      sensor headers (section 5). Body: Event -> 202 { "accepted": bool, "duplicate": bool }
- GET  /api/me                          Bearer -> { "user": { "id", "name", "email" | null }, "company": { "id", "name" }, "role": "operator" | "supervisor" }
- GET  /api/state                       Bearer -> State
- GET  /api/events?limit=100&before=iso Bearer -> [Event] newest first
- GET  /api/alerts?status=open|all      Bearer -> [Alert]
- POST /api/alerts/{alert_id}/ack       Bearer -> Alert (also broadcasts ALERT_ACKNOWLEDGED)
- POST /api/alerts/{alert_id}/voice     Bearer, optional -> audio (section 13)
- POST /api/alerts/{alert_id}/explain   Bearer, optional -> { "explanation": str }, or 501 { "code": "explain_not_configured" }
- GET  /api/metrics/step-durations      Bearer, optional -> [{ "step", "avg_ms", "count", "bucket" }], or 501 { "code": "metrics_unavailable" } without a database
Alert endpoints return 404 { "code": "alert_not_found" } for alerts that do not exist or belong to another company.

State:
```json
{
  "server": { "auth_mode": "disabled | auth0", "persistence": "memory | tiger_data", "voice_enabled": false, "explain_enabled": false },
  "company": { "id": "demo-co", "name": "Demo Manufacturing" },
  "machine": { "machine_id": "assembly_01", "status": "RUNNING", "current_step": "ASSEMBLE", "cycle_id": 12, "step_started_at": "iso or null", "simulated": true },
  "sensor": { "activity_score": 0.42, "active": true, "method": "wifi_csi", "last_update_at": "iso or null", "connected": true },
  "alerts": [Alert],
  "recent_events": [Event]
}
```
voice_enabled = ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are both set. explain_enabled = GEMINI_API_KEY is set.
Alert: { "alert_id", "rule", "severity", "message", "created_at", "cycle_id", "acknowledged": bool, "acknowledged_by": str | null, "acknowledged_at": iso | null, "related_event_ids": [uuid] }
alerts in State: open alerts plus the last 20 acknowledged. recent_events: last 50.

## 10. WebSocket /ws
Server-to-client: { "type": "ready", "data": Ready }, { "type": "state", "data": State }, { "type": "event", "data": Event }, { "type": "alert", "data": Alert }, { "type": "ping" }.
Ready: { "auth_mode": "disabled" | "auth0", "user": { "id", "name" }, "company": { "id", "name" } }

AUTH_DISABLED=false:
1. Client connects, then sends { "type": "auth", "token": "<access token>" } within 5 seconds.
2. Valid token and membership: server sends ready, then state, then live messages.
3. Missing, late, or invalid token: close code 4401. Valid token without membership: close code 4403.

AUTH_DISABLED=true:
1. Client connects and sends nothing.
2. Server immediately sends ready (auth_mode "disabled"), then state, then live messages.
3. Any auth message from the client is ignored.

Both modes:
- No state, event, or alert messages before ready. Order is always ready, then state, then deltas.
- State pushes at most 4 per second; ping every 20 seconds. Client messages other than auth are ignored.
- Config mismatch (client in disabled mode, server requiring auth) ends in close 4401; the client shows "auth configuration mismatch".

## 11. Frontend modes (independent, fixed at startup, no runtime switching)
VITE_DEMO_MODE:
- true: data comes only from the local demo source. Zero requests to VITE_API_URL or VITE_WS_URL. A "Demo data" banner is always visible.
- false (Live): data comes only from the backend. On failure the UI shows offline/reconnecting with the last known state. It never generates or substitutes synthetic data.
VITE_AUTH_DISABLED:
- true: no Auth0; "Auth disabled (dev)" badge. In Live mode the backend must also run AUTH_DISABLED=true.
- false: Auth0 login required for the dashboard.
All four combinations are valid. Sensor data with method "simulated" from the live backend is labeled "Simulated sensor".

## 12. Demo mode behavior
- The demo source emits contract-valid events and state locally: PICK -> MOVE -> ASSEMBLE -> RETURN cycles, sensor method "simulated", periodic activity during ASSEMBLE producing ACTIVITY_REVIEW, occasional STEP_DELAY.
- Acknowledge is handled locally: alert marked acknowledged (acknowledged_by "demo-operator", acknowledged_at now) plus a local ALERT_ACKNOWLEDGED event. Nothing is sent to a server; lost on reload.
- Explain is hidden. Voice is shown disabled with the label "Voice alerts require Live Mode". No ElevenLabs or Gemini calls, and no browser text-to-speech substitute.
- Identity: "Demo Operator" with VITE_AUTH_DISABLED=true, otherwise the Auth0 user's name. Company shown as "Demo Manufacturing (demo data)".

## 13. Voice alerts (ElevenLabs)
POST /api/alerts/{alert_id}/voice
- Auth: same Bearer and company authorization as other alert endpoints. No request body; any body is ignored.
- The spoken text is built server-side only from the stored alert (severity, rule, message, machine_id, related step). Clients cannot supply text.
- Template, at most 300 characters: "FactoryPulse {severity} alert for {machine_id}. {message}" followed by "This is an operational observation for review." for ACTIVITY_REVIEW and ACTIVITY_INFO. It never claims a verified safety incident, identity, or location.
- The backend calls ElevenLabs text-to-speech with ELEVENLABS_VOICE_ID (and ELEVENLABS_MODEL_ID if set), requesting MP3 output. Timeout 15 seconds.
- Success: 200, Content-Type audio/mpeg, body is the MP3 bytes, headers Cache-Control: private, max-age=3600 and X-Voice-Cached: true|false.
- Cache: in memory, keyed by alert_id plus a hash of the spoken text, at most 50 entries (LRU).
- Errors (JSON body { "detail", "code" }):
  401 unauthenticated; 403 no company access;
  404 { "code": "alert_not_found" } for unknown or other-company alerts;
  501 { "code": "voice_not_configured" } if ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID is unset;
  502 { "code": "voice_upstream_error" } for ElevenLabs errors;
  504 { "code": "voice_timeout" } on timeout.
- Never called from the ingest pipeline. The API key is never logged or returned.

