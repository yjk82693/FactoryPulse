# FactoryPulse judging demo (2–3 minutes)

Prototype only. The assembly machine is simulated. Wi-Fi CSI is an operational observation, not certified safety, identity, or location. Shared API: [`docs/event-schema.md`](event-schema.md) Contract **v1.3**.

**Reliable 60–90s judging path (backend up, no ESP32):** Live Mode + in-process machine simulator + one simulated `ACTIVITY_DETECTED` during ASSEMBLE. See “Live simulator demo” below.

**Fallback if FastAPI is down:** Demo Mode. That is the default in `frontend/.env.example`.

## What is what

| Kind | What judges will see |
|---|---|
| **Verified (this frontend)** | Landing, login entry, Demo Mode dashboard, alerts + local ack, layout optimizer with example data, connection/stale UI, Auth0 Universal Login redirect |
| **Verified in software tests (no ESP32)** | Live Mode `GET /api/state`, `/api/me`, `/api/events`, `/api/alerts`, `POST /api/alerts/{id}/ack`, WebSocket `/ws` (`ready` then `state`). Machine sim on dashboard. Synthetic ingest for `ACTIVITY_REVIEW`. See `docs/live-csi.md`. |
| **Team-confirmed physical (24 Oct 2026)** | ESP32 serial → `csi_stream.py` → FastAPI → live dashboard; movement-related `ACTIVITY_*` in real time. Teammate’s computer; video recorded. Prototype path only — not accuracy, reliability, or safety certification. CSI→Tiger **not** verified in that session. |
| **Voice/explain backend** | C-owned `backend/ai/` routes. Voice: 200 MP3 when ElevenLabs env is set and the account allows the voice. Explain: 200 when `GEMINI_API_KEY` is set (`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`, free-tier Flash-Lite). Unset Gemini → 501. |
| **Simulated / example** | DemoSource; Live machine sim (`machine.simulated`). Optimizer floor. Console **in-memory** unless Live + `VITE_CONSOLE_HTTP=true` |

Do not say CSI caused a machine failure. Alerts are for operator review.

---

## Fallback walkthrough (Demo Mode) — use this if hardware/API is down

Env (`frontend/.env`):

```
VITE_DEMO_MODE=true
VITE_AUTH_DISABLED=true
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173

1. **Landing (15s)** — “Explore Demo” → `/dashboard`. Note **Demo data**.
2. **Cell (45s)** — Simulated machine `PICK → MOVE → ASSEMBLE → RETURN`. Activity chart is **Simulated sensor**, not live CSI. Score and workflow stay on one 1080p screen.
3. **Alerts (30s)** — During ASSEMBLE, an `ACTIVITY_REVIEW` may appear (warning, review copy). **Acknowledge**. Voice stays disabled: “Voice alerts require Live Mode”.
4. **Optimizer (45s)** — Header **Optimizer**. Example floor (not CSI coordinates). Click **Optimize Layout**. Expect a real algorithm drop (example baseline **418** → **247**, about **41%**). Swap two stations: suggestion clears. **Reset**. Optional: **Sensor placement** tab compares dedicated vs shared-zone cost/ambiguity (illustrative, not RF).
5. **Console extras (optional 30s)** — **Machines** registry CRUD (in-memory unless Live + `VITE_CONSOLE_HTTP=true`), **Simulator** sustained deviation → review alert (not a fault), **Sensors** shared-zone overlap warning.
6. **Close (15s)** — Machine is simulated. Optimizer is an example layout. If ESP32 + `csi_stream.py` are not running on this machine, stay in Demo Mode or the live simulator path; do not call the chart Wi-Fi CSI.

Total ~2.5–3 minutes. If a cycle is slow, skip waiting for a second alert.

---

## Live simulator demo (60–90 seconds) — use this for judging when FastAPI is up

No ESP32. Machine motion is B’s in-process simulator. Activity is **one** contract-valid simulated ingest during ASSEMBLE (not Wi-Fi CSI).

Frontend (`frontend/.env`):

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_CONSOLE_HTTP=false
```

Backend: gitignored `backend/.env` with `AUTH_DISABLED=true`, `SIM_ENABLED=true`, `SENSOR_INGEST_KEY` set, ElevenLabs secret + voice id if Listen is in the script. Start from repo root so `load_backend_env()` can read `backend/.env`:

```bash
cd /path/to/FactoryTetris
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev
```

Open http://localhost:5173/dashboard — header **LIVE**, **Simulated machine**, **Auth disabled (dev)**.

1. **Cell (20s)** — Workflow walks `PICK → MOVE → ASSEMBLE → RETURN` (~12s cycle). Timeline shows `STEP_STARTED` / `STEP_COMPLETED` with local times.
2. **Alert (20s)** — When the stepper shows **ASSEMBLE**, inject one simulated rising edge (same `SENSOR_INGEST_KEY` as the server, never commit the value):

   ```bash
   backend/.venv/bin/python -c "from backend.envload import load_backend_env; load_backend_env(); import os,httpx; from uuid import uuid4; from datetime import datetime,timezone; s=httpx.get('http://127.0.0.1:8000/api/state').json();
assert s['machine']['current_step']=='ASSEMBLE';
e={'event_id':str(uuid4()),'timestamp':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'source':'sensor','event_type':'ACTIVITY_DETECTED','machine_id':'assembly_01','payload':{'activity_score':0.7,'threshold':0.2,'method':'simulated'}};
print(httpx.post('http://127.0.0.1:8000/api/events',json=e,headers={'X-Sensor-Id':os.getenv('SENSOR_ID','csi-rx-01'),'X-Sensor-Key':os.environ['SENSOR_INGEST_KEY']}).status_code)"
   ```

   Expect `ACTIVITY_REVIEW` (warning): activity near the cell during ASSEMBLE, operator review — not a machine fault. **Acknowledge** if you need the panel clean.
3. **Listen (20s)** — **Listen to Alert** → **Generating audio…** → **Pause**. One ElevenLabs generate per alert; Pause/Resume/replay use the in-memory / `X-Voice-Cached` clip. Do not click Listen twice on a new alert unless you intend a second billed request. Explain stays hidden until Gemini is configured.
4. **Close (10s)** — Machine is simulated. Chart may say waiting for samples or **Simulated sensor** after ingest. Do not call it live Wi-Fi CSI.

If FastAPI is down, switch to the Demo Mode fallback. Do not call this simulator ingest path live Wi-Fi CSI.

---

## Switch to real ESP32 input

The team demonstrated this path on **24 October 2026** on a teammate’s computer (video recorded): live serial CSI → `csi_stream.py` → FastAPI → dashboard. Recalibrate on whatever machine you use today. The dashboard does not change modes. Keep Live Mode (`VITE_DEMO_MODE=false`). Stop sending simulated `ACTIVITY_*`. Run `csi_stream.py` against the same FastAPI (`SENSOR_ID=csi-rx-01`, same ingest key, `machine_id=assembly_01`, `method: wifi_csi`). Details: [`sensing/README.md`](../sensing/README.md).

| Input | How | Dashboard label |
|---|---|---|
| Simulator only | `SIM_ENABLED=true`, no ingest | **Simulated machine**, chart waiting / stale |
| Simulated activity | HTTP `ACTIVITY_DETECTED` `method: simulated` | Score updates; **Simulated sensor** after samples |
| ESP32 CSI | `csi_stream.py` on RX serial | **Wi-Fi CSI** when samples have `method: wifi_csi` |

That teammate experiment is a prototype demonstration, not a measured accuracy study, not CSI→Tiger, and not certified safety. Recalibrate after moving boards. Do not say CSI identified a person or a machine fault. The machine remains simulated.

---

## Conditional live walkthrough (backend up)

Do **not** use the CSI sentences unless `csi_stream.py` is posting `ACTIVITY_*` from RX. Machine motion on this path is still the in-process simulator.

Env:

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
# Keep false for the live-cell demo. Catalog exists but seeds no Console machines.
VITE_CONSOLE_HTTP=false
```

Restart `npm run dev`. Header should show **LIVE** (backend), not Demo data.

1. Machine is labeled **Simulated machine**. Workflow advances `PICK → MOVE → ASSEMBLE → RETURN`.
2. Without `csi_stream.py`, the chart waits for samples (do not call it Wi-Fi CSI). With ingest running, title **Wi-Fi CSI** and score/Active may change — activity near the cell, not a FAULT.
3. If the simulator is in ASSEMBLE, backend rules may open `ACTIVITY_REVIEW`. Otherwise `ACTIVITY_INFO` or no alert in MAINTENANCE.
4. Stop ingest ~5s: **Sensor disconnected**, score labeled **Last reading (stale)**. Header stays **LIVE** if the API is up.
5. Stop the backend: header **RECONNECTING** / **OFFLINE**. Cached score is **Cached reading**, not a live CSI value. Dashboard must not switch to DemoSource.

**Explain / voice:** Listen is shown in Live Mode when `voice_enabled` is true (ElevenLabs env present on the **server**). Explain is **hidden** when `explain_enabled` is false. Unset keys → 501; unknown alert → 404. Spoken text is built **on the server** (v1.3); the SPA never sends speech text or API keys. Gemini copy is shown under Possible interpretations, not as a confirmed fault.

**Console HTTP:** `GET /api/console/catalog` is implemented. Keep `VITE_CONSOLE_HTTP=false` until a supervisor creates Console machines (or you accept an empty Machines/Simulator registry). Failed HTTP fetches keep last-known/empty state and do **not** switch to mock seed data.

If any of those fail, switch back to the Demo Mode fallback. Do not improvise unverified claims.

---

## Talking points

- Detect (CSI activity on the live path, or simulated ingest) → Alert (step-context review) → Optimize (travel cost on an example floor).
- The SPA renders contract sensor events over REST/WebSocket. It does not read ESP32 serial; `csi_stream.py` posts to FastAPI.
- Physical CSI→dashboard was demonstrated 24 October 2026 on a teammate’s computer (video recorded). Machine remains simulated. Do not claim accuracy, safety certification, or CSI→Tiger from that demo.
- Auth0 Client Secret never lives in the SPA.
