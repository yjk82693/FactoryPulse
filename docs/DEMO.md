# FactoryPulse judging demo (2–3 minutes)

Prototype only. The assembly machine is simulated. Wi-Fi CSI is an operational observation, not certified safety, identity, or location.

**Reliable path (always use if ESP32 or backend is missing):** Demo Mode. That is the default in `frontend/.env.example`.

## What is what

| Kind | What judges will see |
|---|---|
| **Verified (this frontend)** | Landing, login entry, Demo Mode dashboard, alerts + local ack, layout optimizer with example data, connection/stale UI, Auth0 Universal Login redirect (callback/JWT vs API not fully verified) |
| **Implemented, not end-to-end tested** | Live Mode (`GET /api/state` + `/ws`), `method: "wifi_csi"` labeling, ElevenLabs voice **UI** (`POST /api/alerts/{id}/voice`) |
| **Pending** | Developer B FastAPI (`backend/` is empty), CSI ingest `POST /api/events`, real ESP32 → dashboard |
| **Simulated / example** | DemoSource machine + sensor (`method: "simulated"`). Optimizer floor and flows (`Example layout`) |

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
4. **Optimizer (45s)** — Header **Optimizer**. Example floor (not CSI coordinates). Click **Optimize Layout**. Expect a real algorithm drop (example baseline **418** → **247**, about **41%**). Swap two stations: suggestion clears. **Reset**.
5. **Close (15s)** — Machine is simulated. Optimizer is an example layout. Live CSI is pending B + ingest.

Total ~2.5 minutes. If a cycle is slow, skip waiting for a second alert.

---

## Conditional live-sensor walkthrough (only if B’s API + ingest are running)

Do **not** use this script unless `GET http://localhost:8000/health` returns ok and someone is posting contract `ACTIVITY_*` events.

Env:

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

Restart `npm run dev`. Header should show **LIVE** (backend), not Demo data.

1. Chart title **Wi-Fi CSI** (not Simulated sensor).
2. Walk the TX–RX path only if ingest is actually running. Score/Active may change. That is **activity near the cell**, not a FAULT.
3. If the simulator is in ASSEMBLE, backend rules may open `ACTIVITY_REVIEW`. Otherwise `ACTIVITY_INFO` or no alert in MAINTENANCE.
4. Stop ingest ~5s: **Sensor disconnected**, score labeled **Last reading (stale)**. Header stays **LIVE** if the API is up.
5. Stop the backend: header **RECONNECTING** / **OFFLINE**. Cached score is **Cached reading**, not a live CSI value. Dashboard must not switch to DemoSource.

If any of those fail, switch back to the Demo Mode fallback. Do not improvise unverified claims.

---

## Talking points

- Detect (CSI concept) → Alert (step-context review) → Optimize (travel cost on an example floor).
- Frontend already renders contract sensor events. It does not read ESP32 serial.
- Auth0 Client Secret never lives in the SPA.
