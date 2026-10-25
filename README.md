# FactoryPulse

HackPSU Fall 2026 prototype: **Detect → Alert → Optimize**.

Wi-Fi CSI activity sensing (2× ESP32) plus a **simulated** assembly cell, operational alerts, a live dashboard, and a layout optimizer. This is not a certified safety system. CSI does not identify people or locations. The assembly machine is simulated. Local Live Mode activity used for judging is a **simulated sensor** observation unless a hardware E2E is separately verified.

Contract: [`docs/event-schema.md`](docs/event-schema.md) **v1.3**. Judging script: [`docs/DEMO.md`](docs/DEMO.md). Live CSI notes: [`docs/live-csi.md`](docs/live-csi.md). Frontend setup: [`frontend/README.md`](frontend/README.md).

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

- Live Mode talks only to FastAPI (`LiveSource`). Demo Mode never calls the network (`DemoSource`). There is no Live→Demo fallback.
- Machine remains `simulated: true` in product terms until the team verifies a non-simulated cell.
- `/api/console/*` exists on B’s backend. The SPA Console stays in-memory unless Live Mode and `VITE_CONSOLE_HTTP=true`.
- Gemini and ElevenLabs keys are **server-only** (`backend/.env`). They are never sent to Vite or the browser.

## Frontend env (names only)

Copy `frontend/.env.example` → `frontend/.env`. Never commit secrets or an Auth0 Client Secret.

`VITE_DEMO_MODE`, `VITE_AUTH_DISABLED`, `VITE_API_URL`, `VITE_WS_URL`, `VITE_CONSOLE_HTTP`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`

Backend names (not frontend): `AUTH_DISABLED`, `SIM_ENABLED`, `SENSOR_ID`, `SENSOR_INGEST_KEY`, `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`. See `backend/.env.example`.

## Implemented (verified)

- Landing, Demo Mode dashboard, Live Mode REST + WebSocket against local FastAPI with `AUTH_DISABLED=true` (machine sim; **not** ESP32 hardware).
- Alerts and acknowledge (`POST /api/alerts/{id}/ack`). `ACTIVITY_REVIEW` is operator review, not a verified incident.
- **Gemini Explain:** `POST /api/alerts/{id}/explain` with `gemini-3.5-flash-lite` returned **HTTP 200** on a simulated `ACTIVITY_REVIEW`. The Live dashboard Explain panel shows stored facts, model interpretations, and the operational-observation disclaimer. Unset `GEMINI_API_KEY` → 501; the control is hidden when `explain_enabled` is false.
- **ElevenLabs Listen:** `POST /api/alerts/{id}/voice` returned a real MP3 (**HTTP 200**) with the Listen/Pause control on a generated alert. Unset ElevenLabs env → 501; hidden when `voice_enabled` is false. Spoken text is built on the server.
- Layout optimizer with example (not CSI) coordinates. Charcoal control-room UI. Stale vs live sensor copy.

## Pending or unverified

- **ESP32 hardware E2E:** firmware and `csi_stream.py` exist; serial CSI → dashboard has **not** been verified end-to-end. Do not treat simulated `ACTIVITY_DETECTED` as ESP32 data.
- **Auth0 backend JWT:** FastAPI JWT verification is implemented and unit-tested. Local Live Mode uses `AUTH_DISABLED=true`. Bearer-token E2E against this API is **unverified**. `AUTH_DISABLED` is local development only.
- **Tiger Data / PostgreSQL:** default persistence is **in-memory**. `DATABASE_URL` selects the repository; persistence tests skip unless `TEST_DATABASE_URL` is set. Tiger Data is **unverified** in the judging setup.
- HTTP Console in the SPA: off by default (`VITE_CONSOLE_HTTP=false`). Backend catalog may be empty even when the adapter is on.

## Limitations

- The assembly cell is a simulated machine in Live Mode and Demo Mode.
- Demo Mode never calls the backend. If FastAPI or hardware is down, use Demo Mode (`docs/DEMO.md`).
- Wi-Fi CSI / activity score is an operational observation of radio-channel change, not diagnosis, identity, or location.
- `ACTIVITY_REVIEW` recommends operator review. It is not a confirmed machine fault or safety incident.
