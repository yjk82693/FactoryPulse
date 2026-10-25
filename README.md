# FactoryPulse: Smart Assembly Cell Intelligence

**Detect → Alert → Optimize** for a single assembly cell.

FactoryPulse connects machine execution with activity sensing so operators see not only what the cell is doing, but what is happening around it. A simulated assembly workflow and activity events feed one live dashboard, with rule-based alerts, Gemini explanations, ElevenLabs spoken briefings, and Tiger Data history.

This is a HackPSU Fall 2026 prototype, not a certified industrial safety system. Wi-Fi CSI observes radio-channel change associated with motion. It does not identify people, measure precise location, or confirm hazards. The assembly machine is simulated.

**[Devpost project](https://devpost.com/software/factorypulse-smart-assembly-cell-intelligence)** · Contract: [`docs/event-schema.md`](docs/event-schema.md) v1.3 · Judging notes: [`docs/DEMO.md`](docs/DEMO.md)

---

## Problem and solution

Machine logs show what a controller scheduled. They do not show physical activity next to the cell. A standalone sensor shows motion, but not whether the machine is in ASSEMBLE, MOVE, or idle.

FactoryPulse keeps those two signals in one operational timeline:

1. **Detect** — timestamped machine steps plus activity scores.
2. **Alert** — deterministic rules (not a model) raise operator-review alerts when activity coincides with ASSEMBLE, or when a step exceeds 1.5× its expected duration.
3. **Optimize** — a layout planner that currently runs on **example** workstation inputs, not CSI coordinates.

Gemini and ElevenLabs **explain and speak** alerts. They never decide whether an alert is raised.

---

## Features

- Simulated **PICK → MOVE → ASSEMBLE → RETURN** cycle (**12 seconds**: 2s + 3s + 5s + 2s) with step events
- React dashboard with REST bootstrap and live **WebSocket** updates
- Rule-based `ACTIVITY_REVIEW` and step-delay alerts, plus acknowledge
- **Gemini** contextual explanations (observed facts, interpretations, disclaimer)
- **ElevenLabs** spoken briefings with pause/resume and server-side caching
- **Tiger Data** (PostgreSQL / TimescaleDB) persistent events and alert state when `DATABASE_URL` is set
- **Auth0** Universal Login (verified locally; presentation demo uses auth disabled)
- Layout optimizer on example inputs
- ESP32 TX/RX firmware and Python CSI pipeline (`sensing/`, `firmware/`) — hardware E2E not yet verified

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
 Simulated machine  │  FastAPI  (backend/main.py)             │
      simulator ───►│  ingest · rules · state · /ws           │
                    │                                         │
 ESP32 CSI* ─► csi_stream.py ─► POST /api/events              │
                    │         │                               │
                    │         ▼                               │
                    │  Tiger Data / TimescaleDB  (optional)   │
                    │  events hypertable · alerts · snapshots │
                    └────────────┬────────────────────────────┘
                                 │ REST + WebSocket
                                 ▼
                    React SPA  (frontend/, Vite :5173)
                    DemoSource  or  LiveSource
                                 │
                    Explain / Listen ──► backend/ai/
                                         Gemini API
                                         ElevenLabs TTS
```

\*Physical CSI path is implemented in firmware and `sensing/processing/python/csi_stream.py`. The **verified** demo uses clearly labeled **simulated** `ACTIVITY_*` events (`method: simulated`), not serial CSI.

- There is **no Vite proxy**. The SPA calls `VITE_API_URL` / `VITE_WS_URL`. CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
- **Live Mode** talks only to FastAPI. **Demo Mode** never calls the network. There is no Live→Demo fallback.
- `company_id` is assigned server-side from membership or the sensor registry, never from the client event body.
- Gemini and ElevenLabs keys are **server-only**. Never put them in `frontend/.env`.

| Path | Role |
|---|---|
| `firmware/`, `sensing/` | ESP32 TX/RX, CSI processing, ingest client |
| `backend/` | FastAPI hub, machine sim, ingest, Console HTTP, Auth0 JWT, optional `DATABASE_URL` |
| `backend/ai/` | Gemini explain and ElevenLabs voice |
| `frontend/` | Dashboard, Auth0 SPA, Explain/Listen, optimizer |
| `docs/event-schema.md` | Shared v1.3 contract |

---

## Technology stack

| Area | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, React Router 6, Vitest, `@auth0/auth0-react`, Recharts |
| Backend | Python 3.11+, FastAPI, Uvicorn, PyJWT, httpx, psycopg |
| Persistence | Tiger Data (PostgreSQL + TimescaleDB), or in-memory if `DATABASE_URL` is unset |
| Auth | Auth0 Universal Login; FastAPI validates RS256 access tokens |
| AI / voice | Gemini API, ElevenLabs TTS (backend only) |
| Sensing | ESP32 firmware, NumPy / PySerial CSI client |
| Tests | `unittest` (backend, sensing), Vitest (frontend) |

---

## Getting started

Prerequisites: **Python 3.11+**, **Node 20+**, Git. Run backend commands from the **repository root** so `backend/.env` loads. Health is `GET /health` (not `/api/health`).

**Never copy a `.venv` between macOS, Linux, and Windows.** Create a new virtualenv on each machine. Git still tracks `.venv313/Scripts/python.exe` from an earlier Windows tree even though `.gitignore` lists `.venv313/`; do not run or copy that file.

### 1. Clone

```bash
git clone https://github.com/yjk82693/FactoryPulse.git
cd FactoryPulse
```

### 2. Backend — macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env`. `SENSOR_INGEST_KEY` must be nonempty or FastAPI will refuse to start. The example `local-dev-key` is **local development only**. Leave `GEMINI_API_KEY`, `ELEVENLABS_*`, and `DATABASE_URL` blank unless you have those accounts — the dashboard still runs; Explain/Listen stay hidden and return 501 if called.

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Check: `curl -s http://127.0.0.1:8000/health` → `{"status":"ok"}`.

### 3. Backend — Windows (PowerShell)

Do not reuse a virtualenv created on macOS or Linux.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r backend\requirements.txt
copy backend\.env.example backend\.env
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

If `Activate.ps1` is blocked, use Command Prompt: `.venv\Scripts\activate.bat`.

Optional CSI-client extras (not required for the software demo):

```powershell
python -m pip install -r sensing\processing\python\requirements.txt
```

### 3b. Windows no-venv launcher (optional)

Developer B added double-click scripts that **do not use a virtualenv**. They install Python packages with `pip install --user` into the current user's Python 3.11 (preferred path `%LOCALAPPDATA%\Programs\Python\Python311\python.exe`, otherwise `py -3`). Python 3.11+ and Node 20+ must already be installed.

| Script | What it does |
|---|---|
| `setup-local.cmd` | `pip install --user` of `backend/requirements.txt` **and** `sensing/processing/python/requirements.txt`, then `npm ci` in `frontend/` |
| `start-local.cmd` | Hidden FastAPI `:8000` and Vite `:5173`; creates `backend/.env` from the example if missing; if neither `frontend/.env` nor `frontend/.env.local` exists, writes Live Mode `frontend/.env.local` (`VITE_DEMO_MODE=false`). Open http://127.0.0.1:5173/dashboard |
| `stop-local.cmd` | Stops those processes |
| `start-local.cmd -Port COM4` | Also starts `scripts/run-sensor.py` on the **ESP32 RX serial port** (not a TCP port). Replace `COM4` with the actual RX COM port. Calibration starts fresh; keep the sensor still during calibration |

Logs and PIDs: `.local-runtime/` (gitignored). Processes keep running if you close the terminal; they are not a Windows service and do not auto-start after reboot. Existing env files are left in place.

This path is convenient on Windows. For isolated, cross-platform work, use the PowerShell venv steps above instead of `--user` installs.

### 4. Frontend

`frontend/.env.example` defaults to **Demo Mode** (`VITE_DEMO_MODE=true`).

```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Windows: `copy .env.example .env` then the same `npm` commands.

Open [http://localhost:5173](http://localhost:5173) or [http://127.0.0.1:5173](http://127.0.0.1:5173).

### 5. Demo Mode vs Live Mode

**Demo Mode** (no backend required): keep `VITE_DEMO_MODE=true`. The SPA uses in-memory `DemoSource`. Explore Demo on the landing page.

**Live Mode** (local FastAPI, typical judging path):

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_CONSOLE_HTTP=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

Backend `backend/.env`: `AUTH_DISABLED=true`, `SIM_ENABLED=true`, nonempty `SENSOR_INGEST_KEY`.

Open `/dashboard`. Expect **LIVE**, **Simulated machine**, workflow PICK → MOVE → ASSEMBLE → RETURN. The activity chart waits for samples until something posts `ACTIVITY_*`. That is not ESP32 CSI unless `csi_stream.py` is running against flashed hardware.

Restart Vite after changing `VITE_*` flags.

### 6. Optional environment variables (names only — never commit values)

| File | Software demo | Optional |
|---|---|---|
| `backend/.env` | `APP_ENV=development`, `AUTH_DISABLED=true`, `SIM_ENABLED=true`, `SENSOR_INGEST_KEY` | `SENSOR_ID` (example default `csi-rx-01`), `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` (example default `gemini-3.5-flash-lite`), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `DEMO_AUTO_JOIN` |
| `frontend/.env` | `VITE_DEMO_MODE`, `VITE_AUTH_DISABLED`; Live Mode also needs `VITE_API_URL` and `VITE_WS_URL` | `VITE_CONSOLE_HTTP`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` |
| CSI client | — | `SERIAL_PORT` (ESP32 RX serial device), `BACKEND_URL` (default `http://localhost:8000`), `SENSOR_ID`, `SENSOR_INGEST_KEY` |

Never put an Auth0 **Client Secret** in the frontend. SPA apps use Domain + Client ID only. For local Auth0 UI testing, use `http://localhost:5173` as the callback (not only `127.0.0.1` unless that origin is also allowlisted).

Keep `VITE_CONSOLE_HTTP=false` for the live-cell demo: the HTTP catalog may have no machines.

---

## Testing

From the repository root, with the backend venv active:

```bash
export AUTH_DISABLED=true SENSOR_INGEST_KEY=test-only-key SIM_ENABLED=false
python -m unittest discover -s backend -p 'test*.py'
python -m unittest discover -s sensing/tests
cd frontend && npm test
```

Windows PowerShell:

```powershell
$env:AUTH_DISABLED = 'true'
$env:SENSOR_INGEST_KEY = 'test-only-key'
$env:SIM_ENABLED = 'false'
python -m unittest discover -s backend -p 'test*.py'
python -m unittest discover -s sensing/tests
cd frontend; npm test
```

Last fully recorded suite (software demo, no Tiger test database):

| Suite | Result |
|---|---|
| Backend | **27 passing**; **5 persistence tests skipped** unless `TEST_DATABASE_URL` is set (`backend/test_persistence.py`) |
| Frontend | **122 passing** (`npm test` → `vitest run`) |
| Sensing | **18 passing**; **1 skipped** |

PR #2 added more CSI-pipeline cases in `sensing/tests/test_csi_stream.py` (the file now defines 26 `test_*` methods). Re-run the commands above for the current tree; do not treat 18 as frozen. Frontend also has `npm run build` and `npm run test:watch`; they are not part of the recorded 122-count run.

`TEST_DATABASE_URL` is a **test-only** name. It is not required for the software demo.

**Do not point `TEST_DATABASE_URL` at the shared Tiger Data instance.** Persistence tests create and drop an isolated schema (`factory_test_<uuid>`). Use a disposable local or throwaway database only.

---

## Verified integrations and current limitations

**Verified**

- Simulated machine and deterministic alerts (`ACTIVITY_REVIEW` during ASSEMBLE; step delay at >1.5× expected duration)
- Live Mode REST + WebSocket against local FastAPI
- Gemini explanation rendered in the dashboard (server key; HTTP 200)
- ElevenLabs MP3 playback, pause/resume, and cache (`X-Voice-Cached`)
- Tiger Data persistence: events in a TimescaleDB hypertable; history and acknowledged alerts restored after backend restart
- Auth0 **local** Google sign-in, RS256 API access token (`aud` = `https://factorypulse-api`), JWT-protected REST, authenticated WebSocket, logout; missing/malformed tokens return 401

The **presentation / judging demo** uses `AUTH_DISABLED=true` for simplicity.

**Not yet verified**

- Full physical ESP32 → CSI → FastAPI → Tiger Data → dashboard path
- Production Auth0 deployment
- Real-account cross-company isolation E2E (schema and API are company-scoped; live cell is single-company `demo-co`)
- Real machine / PLC integration
- Layout optimization from sensor-derived coordinates

---

## Screenshots

Gallery on Devpost: [FactoryPulse: Smart Assembly Cell Intelligence](https://devpost.com/software/factorypulse-smart-assembly-cell-intelligence).

Local capture files are not currently tracked in this repository. Do not treat simulated activity charts as physical CSI.

---

## Team and HackPSU

Three-person team for **HackPSU Fall 2026**, as listed on Devpost: Jeff Kim, Yoojun Kim, and Kunjoong Kim.

Work was split across sensing/firmware, FastAPI/persistence, and the React dashboard, integrated through the v1.3 event contract.

---

## AI-assisted development

**Cursor Agent with Grok 4.6** was the coding agent for implementation, debugging, review, and wiring across the shared contract.

Separately, **Grok Bot** (Cursor’s Grok Bot desktop app, not the IDE chat) runs a named teammate **FactoryPulse Docs Reviewer**. A daily **read-only** README audit routine (`Daily FactoryPulse README review`, around 9:00 AM ET) reviews the public GitHub repo and posts findings only in that Grok Bot conversation. It does not commit, push, or comment on GitHub. A routine Test on **25 October 2026** completed against `main` at `5186d78` with no repository writes.

Neither Cursor nor Grok Bot is a FactoryPulse runtime dependency. The app does not call them in production. Developers remain responsible for design choices, tests, and what we claim as verified.

---

## Roadmap

- Complete physical CSI validation (ESP32 → FastAPI → Tiger Data → dashboard)
- Historical analytics on TimescaleDB (beyond existing step-duration metrics)
- Production Auth0 and independent live cells per company
- Feed operational history into the layout optimizer
- Connect real machine controllers instead of the in-process simulator

---

## Limitations (please read)

- The assembly cell is simulated in Live Mode and Demo Mode.
- Demo Mode never calls the backend.
- Activity scores are operational observations, not diagnosis, identity, or location.
- `ACTIVITY_REVIEW` recommends operator review. It is not a confirmed mechanical failure or safety incident.
- Gemini does not raise alerts.
- The optimizer does not use live CSI positions.
- This is not a production multi-tenant SaaS.
