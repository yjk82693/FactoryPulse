# FactoryPulse Contract v1.3 (source of truth)

Canonical path: `docs/event-schema.md`. Assistants and developers must read this file before implementing APIs.

v1.3 = Contract v1.2 live cell (REST, WebSocket, events, ingest, detection, voice, explain, metrics) **plus** Console configuration APIs, sensing-link / zone / machine mapping, tenancy notes, and explicit P0 limits.

**Archived v1.2:** [`docs/archive/event-schema-v1.2.md`](archive/event-schema-v1.2.md).

Changes to this file still require A+B+C agreement. v1.3 does **not** silently break v1.2 live ingest. Console HTTP, Auth0 on FastAPI, Tiger Data, Gemini, and ElevenLabs are specified here; they are **not** implemented in the current `backend/main.py` unless a section marks them Existing.

Wire JSON is **snake_case**. React Console store uses camelCase (`zoneId`); HTTP adapters map fields. Do not camelCase the v1.2 event envelope.

---

## 0. Project Leadership, Architecture, and Ownership

### Developer C — Project Lead, System/Product Architect, Frontend & Integration Lead

Developer C (Yoojun) leads product direction and end-to-end system shape. This is **architecture, UX, integration, and planning ownership**, not a claim that C authored `firmware/`, `sensing/`, or `backend/`.

- Led overall FactoryPulse product direction and feature planning.
- Designed the expanded system architecture, including the Factory Console, machine-specific behavior profiles, calibration workflows, persistent anomaly detection, and sensor-placement optimization concepts.
- Led the frontend architecture and implementation of the Dashboard, Console, simulators, and optimizers.
- Coordinated the integration strategy between hardware sensing, FastAPI backend, and React frontend.
- Led integration debugging, testing, validation, and troubleshooting of the Dashboard Live API connection.
- Coordinated API contract evolution from v1.2 to v1.3 and cross-team development planning.
- Owns final product integration, user experience, demo readiness, and overall system consistency.

### Developer A — Hardware, CSI sensing, and signal processing

Developer A owns ESP32 firmware, radio/CSI capture, and `sensing/processing` (including `csi_stream.py` mapping amplitude/score/threshold into the 0..1 ingest contract). v1.3 does not reassign that implementation.

### Developer B — FastAPI backend and live event infrastructure

Developer B owns the FastAPI process, in-process machine simulator, `POST /api/events` ingest, State, WebSocket `/ws`, alerts, and the implemented live event path in `backend/main.py`. Console/Auth0/Tiger/Gemini/ElevenLabs work listed below is **assigned to B’s area**, not already shipped.

---

## 0.1 Architecture decisions and rationale

| Decision | Motivation | Integration implication |
|---|---|---|
| Keep v1.2 live cell ingest and `/ws` unchanged | Dashboard Live works against FastAPI at `9ea53e4`. Breaking ingest strands hardware and the demo. | Console APIs are additive under `/api/console/*`. No new keys on `ACTIVITY_*` payloads (`extra='forbid'`). |
| Console configuration ≠ CSI ingest | CSI observes radio-channel change, not machine faults. | Do not POST heatmaps or Console review alerts as `STEP_FAILURE`. Do not merge `MemoryConsoleStore` into `streamReducer`. |
| One live assembly cell plus a Console registry | B’s simulator is one four-phase cell. Console Press/Picker/Conveyor is a planning/hypothesis layer. | `GET /api/state` still returns **one** `machine` and **one** `sensor`. A Console machine may set optional `live_cell_id: "assembly_01"`. |
| Sensing **link** ≠ physical **sensor** | Hardware identity (`csi-rx-01` + ingest key) is not “this zone is shared by two machines.” | Path 2 ingest still requires `machine_id` = bound machine (`assembly_01`). Shared-zone links do not expand the ingest allow-list. |
| Dedicated link is not isolation | A dedicated CSI path is still a radio observation. | APIs and UI must disclaim illustrative isolation. Never claim perfect single-machine RF isolation. |
| Immutable profile versions | Calibration must pin a phase baseline. | `POST .../versions` copies phases and bumps `version`. Existing versions are read-only. |
| Calibration is per installation | Templates are reusable; CSI baselines are site-specific and currently synthetic in UI. | Records reference `machine_id` + `profile_version_id`. Calibrated ≠ measured RF fingerprint. No CSI blob store in P0. |
| Console anomaly detector stays client-side in P0 | Demonstrative vs a synthetic baseline, not a certified classifier. | No backend rule for Console scores. Copy: not a confirmed machine fault. |
| Placement optimizer stays client-side | Scores are labeled cost/coverage/ambiguity assumptions, not RF. | No `/api/console/placement` in P0. |
| `AUTH_DISABLED=true` is development only | Current FastAPI refuses Auth0 mode. Bypass is not production security. | Local Live demo may keep disabled mode. `State.server.auth_mode` reports the truth. |
| Secrets never in the browser | Keys in Vite env would leak. | Voice/explain stay backend POST. |
| Unimplemented optional APIs return **501** | v1.2 already specifies this; current server 404s missing routes. | B adds stub or real routes. Clients already handle 501. |

### Frozen P0 decisions (non-breaking)

These were open in the v1.3 draft. v1.3 **adopts the conservative option**. Changing them later is a new contract revision.

1. `State.server.console_enabled` is **optional**. Omitted means false. Clients ignore unknown `server` keys. Event envelopes still reject extra **top-level** fields.
2. Physical sensor **GET** only in P0. No PATCH of `bound_machine_id` (that would change live ingest). Bind remains env `SENSOR_ID` → `assembly_01`.
3. Ingest `machine_id` must equal the physical sensor’s bound machine. Sensing-link `machine_ids[]` never authorize extra ingest IDs in v1.3.
4. `ACTIVITY_*` payloads must not include `sensing_link_id` or heatmaps.
5. `operator`: live read + ack + voice/explain; Console **read**. `supervisor`: Console **write**. Operators cannot PATCH Console `operating_status`.
6. Seeded Console ids may be slugs (`mch-press-01`). New POSTs SHOULD use UUID v4.
7. Missing voice/explain/metrics routes must be **501** with the specified `code`, not 404.
8. `GET /api/state` stays a singular `machine`. Do not replace it with `cells[]`.
9. `AUTH_DISABLED=true` uses `dev-user` / demo-co / **supervisor**, including Console writes. Not production security.
10. Calibration is state + notes only. No CSI capture blob storage.

---

## 0.2 Compatibility with v1.2

**Preserved:** event envelope; extra top-level field rejection; no client `company_id`; event types and payloads; `POST /api/events` headers, SHA-256 key compare, allowed types, 5-minute future timestamp rule, duplicate semantics; in-process machine simulator as the only machine ingest path; detection rules; REST in §9; WebSocket in §10; frontend mode flags; voice template and “no client speech text”; demo-co, `assembly_01`, `csi-rx-01`.

**Additive:** `/api/console/*`; optional `live_cell_id` on Console machines; optional `console_enabled` on `State.server`; optional explain `502/504` codes.

**Not implementation of this contract:** Auth0 JWT on current FastAPI; voice/explain/metrics routes (404 today); STEP_DELAY / STEP_FAILURE emission (sim duration equals expected); ESP32 serial E2E.

**Forbidden without a new revision:** extra `ACTIVITY_*` payload keys; requiring Auth0 for the current local process; replacing `assembly_01` in ingest; using sensing-link members as the ingest allow-list; putting Console `STOPPED` into live `machine.status`.

---

# Live cell (v1.2 behavior, still normative)

## 1. Runtime
- Backend: http://localhost:8000. Frontend dev: http://localhost:5173 (allowed by backend CORS).
- Demo company: id "demo-co", name "Demo Manufacturing". Machine: "assembly_01" (company demo-co). Sensor: "csi-rx-01" (bound to demo-co / assembly_01).
- Timestamps: UTC ISO 8601 with "Z". Event/alert IDs: UUID v4 strings. Console ids: UUID v4 or stable seed slugs.

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
- Payload objects for ACTIVITY_LEVEL / ACTIVITY_DETECTED / ACTIVITY_CLEARED reject unknown keys.

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
Machine status (live cell) = "IDLE" | "RUNNING" | "FAULT" | "MAINTENANCE"
Rule = "ACTIVITY_REVIEW" | "ACTIVITY_INFO" | "STEP_DELAY" | "STEP_FAILURE"
Severity = "info" | "warning" | "critical"

CSI anomalies are **not** confirmed machine faults. Do not map Console detector alerts onto STEP_FAILURE.

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
- Console sensing links **do not** change this allow-list in v1.3.

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
- AUTH_DISABLED=true (local development only): every REST and WebSocket request acts as user { id "dev-user", name "Dev User" }, company demo-co, role "supervisor". Startup logs a warning. **Not production security.** Current FastAPI **requires** this flag to start.
- AUTH_DISABLED=false: Auth0 RS256 access tokens for audience AUTH0_AUDIENCE (Auth0 API identifier "https://factorypulse-api"). Validate via JWKS: signature, issuer https://{AUTH0_DOMAIN}/, audience, expiry. Identity key is "sub". users.auth0_sub -> memberships(company_id, role). Unknown user -> 403, unless DEMO_AUTO_JOIN=true (added to demo-co as operator).
- If AUTH_DISABLED=false and Auth0 settings are missing, the backend refuses to start.
- All reads, broadcasts, Console CRUD, and alert actions are filtered by the caller's company_id.

### 8.1 Roles

| Role | Live cell | Console |
|---|---|---|
| operator | Read state/events/alerts; ack; voice/explain if enabled | GET catalog and resources |
| supervisor | Same as operator | Create/update/delete Console resources |

Sensor ingest never uses operator JWT.

## 9. REST
In AUTH_DISABLED=true mode, "Bearer" endpoints accept requests without a token.
Error bodies are JSON: { "detail": str, "code": str }.

| code | Typical HTTP |
|---|---|
| unauthenticated | 401 |
| forbidden | 403 |
| alert_not_found | 404 |
| not_found | 404 |
| validation_error | 422 |
| voice_not_configured / explain_not_configured / metrics_unavailable | 501 |
| voice_upstream_error / explain_upstream_error | 502 |
| voice_timeout / explain_timeout | 504 |
| request_failed | fallback |
| profile_kind_mismatch / dedicated_link_requires_one_machine / immutable_version | 422 |

- GET  /health                          no auth -> { "status": "ok" }     **Existing**
- POST /api/events                      sensor headers (section 5). Body: Event -> 202 { "accepted": bool, "duplicate": bool }  **Existing**
- GET  /api/me                          Bearer -> { "user": { "id", "name", "email" | null }, "company": { "id", "name" }, "role": "operator" | "supervisor" }  **Existing**
- GET  /api/state                       Bearer -> State  **Existing**
- GET  /api/events?limit=100&before=iso Bearer -> [Event] newest first; `before` exclusive; max limit 10_000  **Existing**
- GET  /api/alerts?status=open|all      Bearer -> [Alert]  **Existing**
- POST /api/alerts/{alert_id}/ack       Bearer -> Alert (also broadcasts ALERT_ACKNOWLEDGED)  **Existing**
- POST /api/alerts/{alert_id}/voice     Bearer, optional -> audio (section 13)  **Specified; missing (404 today — must become 501 or 200)**
- POST /api/alerts/{alert_id}/explain   Bearer, optional -> { "explanation": str } (section 13.1)  **Specified; missing**
- GET  /api/metrics/step-durations      Bearer, optional -> [{ "step", "avg_ms", "count", "bucket" }], or 501 { "code": "metrics_unavailable" } without a database  **Specified; missing**
- `/api/console/*`                      section 16  **Specified; not implemented**

Alert endpoints return 404 { "code": "alert_not_found" } for alerts that do not exist or belong to another company.

State:
```json
{
  "server": { "auth_mode": "disabled | auth0", "persistence": "memory | tiger_data", "voice_enabled": false, "explain_enabled": false, "console_enabled": false },
  "company": { "id": "demo-co", "name": "Demo Manufacturing" },
  "machine": { "machine_id": "assembly_01", "status": "RUNNING", "current_step": "ASSEMBLE", "cycle_id": 12, "step_started_at": "iso or null", "simulated": true },
  "sensor": { "activity_score": 0.42, "active": true, "method": "wifi_csi", "last_update_at": "iso or null", "connected": true },
  "alerts": [Alert],
  "recent_events": [Event]
}
```
`console_enabled` is optional; omit or false until `/api/console/*` exists. Clients ignore unknown `server` keys.
voice_enabled = ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are both set. explain_enabled = GEMINI_API_KEY is set.
Alert: { "alert_id", "rule", "severity", "message", "created_at", "cycle_id", "acknowledged": bool, "acknowledged_by": str | null, "acknowledged_at": iso | null, "related_event_ids": [uuid] }
alerts in State: open alerts plus the last 20 acknowledged. recent_events: last 50.

**Provenance:** `machine.simulated: true` means assembly motion is generated in-process. `method: "simulated"` vs `"wifi_csi"` labels the activity score. UI: Simulated machine; Simulated sensor vs Wi-Fi CSI; waiting for samples when `last_update_at` is null. Never label CSI as FAULT.

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
- Console resources are **not** streamed on `/ws` in P0. Clients refetch Console after mutations.

## 11. Frontend modes (independent, fixed at startup, no runtime switching)
VITE_DEMO_MODE:
- true: data comes only from the local demo source. Zero requests to VITE_API_URL or VITE_WS_URL. A "Demo data" banner is always visible. Console may still use in-memory mocks.
- false (Live): live cell data comes only from the backend. On failure the UI shows offline/reconnecting with the last known state. It never generates or substitutes synthetic live-cell data.
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
- Frontend plays the blob via a single `HTMLAudioElement`. Hide or disable the control when `voice_enabled` is false.

## 13.1 Alert explanation (Gemini)
POST /api/alerts/{alert_id}/explain
- Auth: Bearer, same company as the alert.
- Request body: empty; ignore any client JSON. Do not forward operator-authored prompts.
- Server prompt uses only stored alert fields + machine_id + current_step if known. Must state operational observation, not verified incident, identity, or location.
- 200: { "explanation": string } (cap ~2000 characters).
- 404 alert_not_found; 501 explain_not_configured if GEMINI_API_KEY unset; optional 502 explain_upstream_error; 504 explain_timeout (15s).
- Never called from ingest. Key never logged or returned. Dashboard hides explain when `explain_enabled` is false (and in Demo Mode).

---

# Console (v1.3 additive)

## 14. Domain model (wire snake_case)

Aligned with `frontend/src/console/types.ts`. HTTP adapter maps camelCase.

### Zone
```json
{ "id": "zone-a", "name": "Zone A — press cell" }
```

### Phase (immutable snapshot inside a profile version)
```json
{ "id": "press", "name": "PRESS", "expected_activity": 0.82, "duration_ticks": 8 }
```
`expected_activity` in [0, 1]. Ticks are Console-sim time, not CSI packet indices.

### Profile template
```json
{ "id": "tpl-press", "name": "Press cycle", "machine_kind": "press", "version": 1, "phases": [] }
```
`machine_kind`: `press` | `picker` | `conveyor`.

### Motion profile
```json
{ "id": "uuid", "template_id": "tpl-press", "name": "Press — cell A", "machine_kind": "press", "current_version": 1, "created_at": "iso" }
```

### Profile version (immutable)
```json
{ "id": "uuid", "profile_id": "uuid", "version": 2, "phases": [], "created_at": "iso", "created_by": "user-id-or-dev-user" }
```
PATCH of phases on an existing version → 422 `immutable_version`.

### Calibration (per installation)
```json
{ "id": "uuid", "profile_id": "uuid", "profile_version_id": "uuid", "machine_id": "uuid", "state": "uncalibrated | calibrating | calibrated", "version": 1, "notes": "Synthetic install baseline", "updated_at": "iso" }
```
`version` increments when transitioning to `calibrated`. Notes must not claim a certified RF fingerprint.

The in-memory frontend nests calibrations on `MotionProfile`. The HTTP API stores them as their own resource; the adapter flattens.

### Console machine
```json
{
  "id": "uuid",
  "name": "Press-01",
  "kind": "press",
  "zone_id": "zone-a",
  "operating_status": "IDLE | RUNNING | MAINTENANCE | STOPPED",
  "profile_id": "uuid",
  "live_cell_id": "assembly_01",
  "sensor_link_ids": ["uuid"],
  "created_at": "iso"
}
```
`live_cell_id` optional; if set, must be `assembly_01`. `operating_status` is Console configuration, **not** `State.machine.status`. `STOPPED` is Console-only. Live FAULT remains STEP_FAILED / status FAULT.

Frontend field `status` maps to wire `operating_status`.

### Physical CSI sensor
```json
{ "id": "csi-rx-01", "company_id": "demo-co", "bound_machine_id": "assembly_01", "active": true, "key_fingerprint": "sha256-hex-or-omitted", "created_at": "iso" }
```
Responses never include the raw key.

### Sensing link
```json
{
  "id": "uuid",
  "name": "CSI link Zone A",
  "mode": "dedicated | shared_zone",
  "zone_id": "zone-a",
  "machine_ids": ["uuid"],
  "physical_sensor_id": "csi-rx-01",
  "ambiguity": {
    "level": "low | high",
    "summary": "Shared zone: Press-01 and Picker-01 may produce overlapping CSI. Machine-level scores are hypotheses."
  }
}
```
- dedicated ⇒ `machine_ids.length === 1`. Summary must still say illustrative path, not perfect isolation.
- shared_zone ⇒ at least one machine; if ≥2, `level: high`.
- `physical_sensor_id` optional in P0 (config only).

Frontend `SensorLink` omits `physical_sensor_id` and `ambiguity`; the adapter may compute ambiguity client-side until the API returns it.

## 15. Physical CSI ↔ link ↔ zone ↔ machine

```
[ESP32 TX/RX] --serial--> [csi_stream.py] --POST /api/events--> [live cell assembly_01]
                                      +-- X-Sensor-Id: csi-rx-01

[Zone] 1---* [Console machine]
[Sensing link] *---* [Console machine]   dedicated: 1; shared_zone: many
[Sensing link] *---1 [Zone]
[Sensing link] *---0..1 [Physical sensor]
```

Ambiguity: multiple similar machines on one link/zone may overlap in CSI. Console simulator machine scores are **hypotheses** for operator review, not confirmed faults, and not STEP_FAILURE.

P0 ingest: `machine_id` must equal the physical sensor bound id (`assembly_01`). Shared-zone Console links do not authorize extra ingest machine IDs.

## 16. Console REST

**Auth:** Bearer (or disabled-dev identity). Isolation by `company_id`.  
**Writes:** supervisor. **Reads:** operator or supervisor.  
**Persistence:** memory allowed until `DATABASE_URL` is set (`persistence: tiger_data`).  
**Status:** **Proposed / not implemented.** Frontend uses `MemoryConsoleStore` until `HttpConsoleStore`.  
**Prefix:** `/api/console`.  
Idempotency-Key optional (P1).

### 16.1 GET `/api/console/catalog`
- Auth: operator+
- 200: `{ "zones", "templates", "profiles", "profile_versions", "calibrations", "machines", "sensors", "sensing_links" }`
- Persistence: read models
- Tests: seed company returns demo zones; other company empty or 404 isolation

### 16.2 Zones
GET `/api/console/zones` → Zone[] (operator+). P0: seeded Zone A / Zone B. POST optional if time allows.
GET `/api/console/zones/{id}` → 404 `not_found` if missing or other tenant.

### 16.3 Machines
GET `/api/console/machines` → ConsoleMachine[]

POST `/api/console/machines` (supervisor)  
Request: `{ "name", "kind", "zone_id", "operating_status", "profile_id", "live_cell_id"? }`  
201 machine; 422 `profile_kind_mismatch` if profile kind ≠ kind.

GET `/api/console/machines/{id}`

PATCH `/api/console/machines/{id}` (supervisor)  
Subset of name, zone_id, operating_status, profile_id, live_cell_id.

DELETE `/api/console/machines/{id}` (supervisor) → 204; drop id from sensing links; 404 if missing.

Tests: Press + picker profile → 422; delete removes link membership; operator POST → 403.

### 16.4 Profile templates
GET `/api/console/profile-templates` → press/picker/conveyor seeds (immutable templates).

### 16.5 Profiles and versions
GET `/api/console/profiles`

POST `/api/console/profiles` `{ "template_id", "name" }` → 201 profile + version 1 copied from template.

GET `/api/console/profiles/{id}` includes `current_version` and current phases.

GET `/api/console/profiles/{id}/versions`

POST `/api/console/profiles/{id}/versions` `{ "phases": Phase[] }` or empty body (clone current and bump) → 201 immutable version; current_version updates.

Reject PATCH of version phases (`immutable_version`).

Tests: second POST → version=2; GET v1 phases unchanged.

### 16.6 Calibrations
GET `/api/console/calibrations?machine_id=&profile_id=`

POST `/api/console/calibrations` `{ "profile_id", "profile_version_id", "machine_id", "state", "notes"? }`  
200/201 upsert by (profile_id, machine_id); increment record version when state=calibrated.

Tests: calibrating then calibrated increments version.

### 16.7 Physical sensors
GET `/api/console/sensors` → env sensor row, no raw key.

No PATCH in P0 (frozen decision #2).

### 16.8 Sensing links
GET `/api/console/sensing-links`

POST `/api/console/sensing-links` `{ "name", "mode", "zone_id", "machine_ids", "physical_sensor_id"? }`  
422 `dedicated_link_requires_one_machine`. 201 includes computed `ambiguity`.

PUT `/api/console/sensing-links/{id}` same body (replace).

DELETE `/api/console/sensing-links/{id}` → 204.

Tests: dedicated with two machines 422; shared two machines `ambiguity.level=high`; dedicated one machine still has isolation disclaimer.

## 17. Tiger Data persistence

When DATABASE_URL unset: `persistence: memory` (current). Restarts lose data.

When set: `persistence: tiger_data`.

Events (v1.2 §6): `event_ids`, `events` hypertable on `ts`.

Console / identity (relational, not hypertables), P1:

`companies`, `users`, `memberships`, `console_zones`, `console_machines`, `console_profiles`, `console_profile_versions`, `console_calibrations`, `physical_sensors` (key **hash** only), `sensing_links`, `sensing_link_machines`.

Every Console row includes `company_id`. Cross-tenant IDs return 404 without leaking existence.

Console mutation audit log is out of P0.

GET `/api/metrics/step-durations`: 200 with hour buckets when DB present; 501 `metrics_unavailable` otherwise.

## 18. Out of backend P0 (remain frontend-local)

| Feature | Location | v1.3 |
|---|---|---|
| Motion simulator Start/Pause/Reset, seeds, scenarios | SimulatorPage | Client-side; no replay API |
| Persistent anomaly detector | detection.ts | Client-side review alerts |
| Sensor placement scores | placement.ts | Client-side; labeled assumptions |
| Layout optimizer 6! search | frontend/src/optimizer | Unchanged, not CSI |
| DemoSource | frontend | Unchanged |

A future replay API must not reuse `POST /api/events` for Console synthetic ticks.

## 19. Implementation status and dependency map

```
[A] ESP32 + csi_stream.py ──ingest §5──► [B] POST /api/events
                                           ├─ State + /ws ──► [C] LiveSource Dashboard
                                           ├─ alerts/ack
                                           ├─ voice/explain/metrics (501-or-real)
                                           └─ /api/console/* ──► [C] HttpConsoleStore
                                                                  └─ UI already exists (mocks)
```

Suggested sequence (does not reassign ownership):

1. Keep live ingest unchanged (done for Dashboard).
2. B: 501 stubs for voice/explain/metrics.
3. B: Auth0 **or** keep AUTH_DISABLED for the demo — never pretend JWT works.
4. B: `/api/console/catalog` + machines CRUD.
5. B: profiles/versions/calibrations/links.
6. C: `HttpConsoleStore` implementing `ConsoleStore`.
7. Tiger Data: events hypertable before Console tables.
8. A: hardware E2E against unchanged ingest; calibration measurements as notes.
9. Gemini/ElevenLabs last; flags gate the UI.

## 20. Acceptance tests

Live cell (regression):
- POST /api/events without headers → 401
- Wrong key → 401
- source=machine on HTTP → 403
- Duplicate event_id → `{ accepted: false, duplicate: true }`, no second alert
- ACTIVITY_DETECTED in ASSEMBLE → one REVIEW per cycle
- 5s silence → sensor.connected=false
- /ws first two messages ready, then state
- Ack persists and broadcasts ALERT_ACKNOWLEDGED
- Frontend LiveSource never substitutes DemoSource on API failure

Console (when implemented):
- Dedicated link with two machines → 422
- Shared link ambiguity high
- Profile kind mismatch → 422
- Version immutability
- Calibration version bump
- Tenant isolation 404
- Operator cannot DELETE machine
- PATCH physical bound_machine_id is absent (404 or 405) in P0

Voice / explain:
- Unset keys → 501 with specified codes (not 404)
- No secrets in responses or logs
- Client body text is not spoken or sent to Gemini
- Demo Mode makes zero voice/explain network calls

## Appendix A — Endpoint roster

| Method | Path | Status |
|---|---|---|
| GET | `/health` | Existing |
| POST | `/api/events` | Existing |
| GET | `/api/me` | Existing |
| GET | `/api/state` | Existing |
| GET | `/api/events` | Existing |
| GET | `/api/alerts` | Existing |
| POST | `/api/alerts/{id}/ack` | Existing |
| POST | `/api/alerts/{id}/voice` | Specified; missing (404 today) |
| POST | `/api/alerts/{id}/explain` | Specified; missing |
| GET | `/api/metrics/step-durations` | Specified; missing |
| WS | `/ws` | Existing (auth-disabled only) |
| GET | `/api/console/catalog` | Specified; not implemented |
| GET | `/api/console/zones` | Specified; not implemented |
| GET/POST/PATCH/DELETE | `/api/console/machines` | Specified; not implemented |
| GET | `/api/console/profile-templates` | Specified; not implemented |
| GET/POST | `/api/console/profiles` | Specified; not implemented |
| GET/POST | `/api/console/profiles/{id}/versions` | Specified; not implemented |
| GET/POST | `/api/console/calibrations` | Specified; not implemented |
| GET | `/api/console/sensors` | Specified; not implemented |
| GET/POST/PUT/DELETE | `/api/console/sensing-links` | Specified; not implemented |
