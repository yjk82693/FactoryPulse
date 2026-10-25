# FactoryPulse

HackPSU Fall 2026 prototype: **Detect → Alert → Optimize**.

Wi-Fi CSI activity sensing (2× ESP32) plus a **simulated** assembly cell, operational alerts, a live dashboard, and a layout optimizer. This is not a certified safety system. CSI does not identify people or locations. The assembly machine is simulated. The software demo uses a **simulated sensor** unless a hardware E2E is separately verified.

Contract: [`docs/event-schema.md`](docs/event-schema.md) **v1.3**. Judging script: [`docs/DEMO.md`](docs/DEMO.md). Live CSI notes: [`docs/live-csi.md`](docs/live-csi.md). Frontend details: [`frontend/README.md`](frontend/README.md).

| Directory | Owner |
|---|---|
| `firmware/`, `sensing/` | Developer A — ESP32 TX/RX, CSI processing, `csi_stream.py` ingest client |
| `backend/` ingest, Console HTTP, Auth0, persistence | Developer B — FastAPI hub, machine sim, `/api/events`, `/api/console/*`, optional `DATABASE_URL` |
| `backend/ai/` | Developer C — Gemini explain and ElevenLabs voice (isolated from ingest) |
| `frontend/` | Developer C — React dashboard, Auth0 SPA, Explain/Listen UI, optimizer, Console adapter |
| `docs/event-schema.md` | Shared contract **v1.3** — change only with A+B+C. Archived v1.2: `docs/archive/event-schema-v1.2.md` |

## Architecture

```
ESP32 TX/RX  →  csi_stream.py     →  POST /api/events     FastAPI :8000
Machine sim  →  in-process ingest →  State + WS /ws    →  React :5173
Gemini       →  POST /api/alerts/{id}/explain  (C, backend/ai, server key only)
ElevenLabs   →  POST /api/alerts/{id}/voice    (C, backend/ai, server key only)
```

- There is **no Vite proxy**. The SPA calls `VITE_API_URL` / `VITE_WS_URL` directly. FastAPI CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
- Live Mode talks only to FastAPI (`LiveSource`). Demo Mode never calls the network (`DemoSource`). There is no Live→Demo fallback.
- Machine remains `simulated: true` until the team verifies a non-simulated cell.
- `/api/console/*` exists. The SPA Console stays in-memory unless Live Mode and `VITE_CONSOLE_HTTP=true` (HTTP catalog may have **no machines**).
- Gemini and ElevenLabs keys are **server-only**. Never put them in `frontend/.env`.

---

## Teammate setup (A/B — complete software demo, no ESP32)

Requires **Python 3.11+** and **Node 20+**. Run commands from the **repository root** (`FactoryPulse`). Health is `GET /health` (not `/api/health`).

### 1. Backend

```bash
git pull origin main
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install -U pip
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

`backend/.env` must include a **nonempty** ingest secret. The example `SENSOR_INGEST_KEY=local-dev-key` is **local development only**, not production. FastAPI **refuses to start** if the key is empty. Leave `GEMINI_API_KEY` and `ELEVENLABS_*` blank unless you have those accounts — the dashboard still runs; Explain/Listen stay hidden and return 501 if called.

```bash
# still in the venv, still at repo root
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Check: `curl -s http://127.0.0.1:8000/health` → `{"status":"ok"}`.

Optional CSI-client extras (A only, not required for the software demo):

```bash
python -m pip install -r sensing/processing/python/requirements.txt
```

### 2. Frontend (Live Mode against that backend)

`frontend/.env.example` defaults to **Demo Mode**. For the shared Live demo, copy it and switch flags:

```bash
cd frontend
cp .env.example .env
```

Set in `frontend/.env` (no secrets):

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_CONSOLE_HTTP=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [http://127.0.0.1:5173/dashboard](http://127.0.0.1:5173/dashboard) (or `http://localhost:5173/dashboard`). Expect **LIVE**, **Simulated machine**, workflow `PICK → MOVE → ASSEMBLE → RETURN`. The activity chart waits for samples until something posts `ACTIVITY_*` — that is not ESP32 CSI.

If FastAPI is down, set `VITE_DEMO_MODE=true`, restart Vite, and use Demo Mode instead.

### 3. Tests (from repo root, venv active)

```bash
export AUTH_DISABLED=true SENSOR_INGEST_KEY=test-only-key SIM_ENABLED=false
python -m unittest discover -s backend -p 'test*.py'
cd frontend && npm test
```

Persistence tests skip unless `TEST_DATABASE_URL` is set. That is expected.

### Env names (never commit values)

| File | Required for software demo | Optional |
|---|---|---|
| `backend/.env` | `AUTH_DISABLED=true`, `SIM_ENABLED=true`, `SENSOR_INGEST_KEY`, `APP_ENV=development` | `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `DATABASE_URL`, Auth0 |
| `frontend/.env` | `VITE_DEMO_MODE`, `VITE_AUTH_DISABLED`, and in Live Mode `VITE_API_URL` + `VITE_WS_URL` | `VITE_CONSOLE_HTTP`, Auth0 SPA ids |

---

## Implemented (verified)

- Landing, Demo Mode, Live Mode REST + WebSocket against local FastAPI with `AUTH_DISABLED=true` (machine sim; **not** ESP32 hardware).
- Alerts and acknowledge. `ACTIVITY_REVIEW` is operator review, not a verified incident.
- **Gemini Explain** and **ElevenLabs Listen** when server keys are set (real HTTP 200 + dashboard UI). Unset keys → 501; controls hidden when `explain_enabled` / `voice_enabled` are false.
- Layout optimizer with example (not CSI) coordinates.

## Pending or unverified

- **ESP32 hardware E2E:** firmware and `csi_stream.py` exist; serial CSI → dashboard has **not** been verified. Do not treat simulated `ACTIVITY_DETECTED` as ESP32 data.
- **Auth0 backend JWT:** verification code is unit-tested. Local demo uses `AUTH_DISABLED=true`. Bearer E2E against this API is **unverified**.
- **Tiger Data / PostgreSQL:** default is **in-memory**. Persistence tests skip without `TEST_DATABASE_URL`.
- HTTP Console in the SPA: keep `VITE_CONSOLE_HTTP=false` for the live-cell demo.

## Limitations

- The assembly cell is a simulated machine in Live Mode and Demo Mode.
- Demo Mode never calls the backend.
- Wi-Fi CSI / activity score is an operational observation of radio-channel change, not diagnosis, identity, or location.
- `ACTIVITY_REVIEW` recommends operator review. It is not a confirmed machine fault or safety incident.
- There is no Vite reverse-proxy; mismatched `localhost` vs `127.0.0.1` for the **page** is fine (CORS allows both). Keep `VITE_API_URL` pointing at the API you actually started.
