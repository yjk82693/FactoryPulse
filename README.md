# FactoryPulse

HackPSU Fall 2026 prototype: **Detect → Alert → Optimize**.

Wi-Fi CSI activity sensing (2× ESP32) plus a **simulated** assembly cell, operational alerts, a live dashboard, and a layout optimizer. This is not a certified safety system. CSI does not identify people or locations.

| Directory | Owner |
|---|---|
| `firmware/`, `sensing/` | Developer A (ESP32, Wi-Fi CSI) |
| `backend/` | Developer B (FastAPI, simulator, Auth0 JWT, ElevenLabs) — **not in repo yet** |
| `frontend/` | Developer C (React dashboard, Auth0 SPA, voice UI, optimizer) |
| `docs/event-schema.md` | Shared contract v1.2 — change only with A+B+C |

Judging script: [`docs/DEMO.md`](docs/DEMO.md). Frontend setup: [`frontend/README.md`](frontend/README.md).

## Architecture

```
ESP32 TX/RX  →  (pending ingest)  →  POST /api/events   FastAPI :8000
Machine sim  →  in-process ingest →  State + WS /ws  →  React :5173
Layout optimizer is frontend-local example data (replaceable provider).
```

## Frontend env (names only)

Copy `frontend/.env.example` → `frontend/.env`. Never commit secrets or an Auth0 Client Secret.

`VITE_DEMO_MODE`, `VITE_AUTH_DISABLED`, `VITE_API_URL`, `VITE_WS_URL`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`

Sensing/backend names (not frontend): `BACKEND_URL`, `SENSOR_ID`, `SENSOR_INGEST_KEY`, `SERIAL_PORT`, `AUTH_DISABLED`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, ElevenLabs/Gemini keys on the **server only**.

## Implemented features (frontend)

- Landing, Auth0 login entry, Demo Mode dashboard, LiveSource client, alerts + optimistic ack, ElevenLabs **play UI**, `/optimizer` exhaustive layout search, charcoal control-room layout, stale vs live sensor copy.

## Status of integrations

**Verified in this frontend:** Demo Mode UI, optimizer example costs from the algorithm, unit tests, production build, Auth0 redirect to Universal Login (password/callback/API JWT not fully verified).

**Implemented, not end-to-end tested:** Live `GET /api/state` + `/ws`, `wifi_csi` method labeling, voice `POST /api/alerts/{id}/voice`.

**Pending:** FastAPI, CSI ingest to contract events, real ESP32 → dashboard, ElevenLabs/Gemini on B’s process.

**Simulated / example:** DemoSource (`method: "simulated"`). Optimizer workstations/flows.

## Limitations

- Machine is always simulated in product terms (even in Live Mode, `machine.simulated` is expected true until the team says otherwise).
- Demo Mode never calls the backend. If ESP32 or API is down, use Demo Mode (`docs/DEMO.md`).
- `ACTIVITY_REVIEW` is operator review, not a verified incident.
