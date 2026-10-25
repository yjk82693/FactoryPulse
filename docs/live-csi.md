# Live CSI -> React (local development)

Contract: [`docs/event-schema.md`](event-schema.md) **v1.3** (live ingest unchanged from v1.2).

The existing React `LiveSource` consumes Developer B’s FastAPI backend without swapping in Demo data. The **machine is always simulated**. Sensor readings come from `POST /api/events` (ESP32 RX via `csi_stream.py`, or a contract-valid test ingest). Local default is `AUTH_DISABLED=true` and in-memory persistence unless `DATABASE_URL` is set. `/api/console/*` exists; the SPA still uses in-memory Console until `VITE_CONSOLE_HTTP=true`. Gemini explain and ElevenLabs voice live in isolated C-owned modules (`backend/ai/`) and return **501** when keys are unset. Keep the server bound to localhost. Hardware serial → dashboard is **not** claimed as a verified E2E here.

**Verified (no ESP32 hardware):** REST (`/health`, `/api/me`, `/api/state`, `/api/events`, `/api/alerts`, `POST /api/alerts/{id}/ack`) and WebSocket `/ws` (`ready` then `state`) with `AUTH_DISABLED=true` and `SIM_ENABLED=true`. Activity for review alerts is a **synthetic HTTP** `ACTIVITY_DETECTED` (`method: simulated`), not serial CSI. Voice and explain return **501** when ElevenLabs/Gemini env is unset (not 404). With keys set, those routes return 200 (see root README).

## 1. Backend (from FactoryPulse repo root)

macOS / zsh:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
export AUTH_DISABLED=true
export SIM_ENABLED=true
export SENSOR_ID=csi-rx-01
export SENSOR_INGEST_KEY='replace-with-your-local-secret'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

PowerShell:

```powershell
python -m pip install -r backend/requirements.txt
$env:AUTH_DISABLED = 'true'
$env:SIM_ENABLED = 'true'
$env:SENSOR_ID = 'csi-rx-01'
$env:SENSOR_INGEST_KEY = 'replace-with-your-local-secret'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Startup **requires** a nonempty `SENSOR_INGEST_KEY`. Local software demo uses `AUTH_DISABLED=true` (allowed only when `APP_ENV` is development/local/test). JWT verification exists in `backend/auth.py` and unit tests; Bearer E2E against this FastAPI is **unverified**. Keep `AUTH_DISABLED=true` for the teammate demo.

Backend contract tests (from repo root, with the venv active). CSI preprocessing also needs `numpy` and `pyserial` (`sensing/processing/python/requirements.txt`):

```bash
export AUTH_DISABLED=true SENSOR_INGEST_KEY=test-only-key SIM_ENABLED=false
python -m unittest backend.test_live
```

## 2. Sensor (optional, ESP32 — not required for dashboard Live Mode)

Flash TX/RX as described in `sensing/processing/README.md`. Close the serial monitor.

```bash
python -m pip install -r sensing/processing/python/requirements.txt
export SENSOR_INGEST_KEY='replace-with-your-local-secret'
python sensing/processing/python/csi_stream.py --port /dev/cu.usbserial-XXXX
```

PowerShell uses `COM5` in place of the cu.usbserial device.

Keep sensors fixed and the figure standing still during the initial 20-second calibration. The default detector uses a 0.2-second window, per-subcarrier adjacent-amplitude changes, and 50ms detection sustain. Compare 0.2/0.5-second windows and 50/100ms sustain as described in [the figure fall experiment](figure-fall-csi.md).

The headless detector publishes `ACTIVITY_LEVEL` up to ten times per second by default and detected/cleared transitions with `method: wifi_csi`. HTTP runs on a separate thread. On reconnection it publishes the current status instead of replaying old movement. After CSI interruption it recalibrates.

Until this process is posting events, the dashboard must **not** be described as a hardware CSI demo. Backend default `sensor.method` is `wifi_csi` even with no samples; the UI labels that state as waiting for samples, not a live CSI reading.

## 3. React (Live Mode, auth disabled)

Set these values in `frontend/.env` (or `.env.local`), retaining any unrelated existing settings. Restart `npm run dev` after changes. Never put `SENSOR_INGEST_KEY` in frontend env.

```dotenv
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173/dashboard.

### Verified with the machine simulator only

- Header **LIVE** (backend WebSocket), company Demo Manufacturing, user **Dev User**.
- Machine card **Simulated machine**, `PICK → MOVE → ASSEMBLE → RETURN` from in-process sim (`machine.simulated: true`).
- Sensor **disconnected** until ingest; score is not a live CSI value.
- Timeline shows `STEP_STARTED` / `STEP_COMPLETED`.
- Acknowledge uses `POST /api/alerts/{id}/ack`. Explain/voice stay disabled while `explain_enabled` / `voice_enabled` are false (no server keys). Unknown alert ids return 404 even when keys are unset.
- Stopping the backend: **RECONNECTING** / **OFFLINE**. Dashboard does not switch to DemoSource.

### Only if `csi_stream.py` is actually running against RX

- Chart/method **Wi-Fi CSI**, Sensor connected, changing activity score.
- Movement during ASSEMBLE: one `ACTIVITY_REVIEW` warning per cycle; other steps: `ACTIVITY_INFO`.
- Unplug RX: within five seconds **Sensor disconnected**, Active cleared. Header can stay **LIVE**.

If any of those hardware checks fail, say so. Do not claim ESP32 end-to-end from the simulator-only path.

## 4. What this backend does not provide

- Auth0 / Bearer JWT
- `/api/console/*` (frontend Console stays on in-memory mocks; keep `VITE_CONSOLE_HTTP=false` until B ships catalog)
- Real Gemini/ElevenLabs calls until server env keys are set (unset → 501, never in the browser)
- `GET /api/metrics/step-durations`
- `STEP_DELAY` / `STEP_FAILURE` (sim always completes on expected duration)
