# Live CSI -> React (local development)

The existing React LiveSource consumes this backend without UI changes. The machine
is simulated; sensor readings come from the physical ESP32 receiver. This backend
implements local, single-company, in-memory operation only; Auth0, database, voice,
and explanations are not implemented. Keep the server bound to localhost.

## 1. Backend (PowerShell, from FactoryTetris)

```powershell
python -m pip install -r backend/requirements.txt
$env:AUTH_DISABLED = 'true'
$env:SIM_ENABLED = 'true'
$env:SENSOR_ID = 'csi-rx-01'
$env:SENSOR_INGEST_KEY = 'replace-with-your-local-secret'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## 2. Sensor (another terminal, from FactoryTetris)

Flash TX/RX as described in sensing/processing/README.md. Close the serial monitor.

```powershell
python -m pip install -r sensing/processing/python/requirements.txt
$env:SENSOR_INGEST_KEY = 'replace-with-your-local-secret'
python sensing/processing/python/csi_stream.py --port COM5
```

Replace COM5 with the RX port. Leave the sensing area empty for the first eight
seconds. Per-frame normalized CSI amplitude is measured over a one-second window;
mean subcarrier standard deviation becomes the activity score. The threshold is
baseline mean + 4 standard deviations. Both score and threshold use x/(1+x) to
fit the existing 0..1 event contract. This measures movement, not reliable stationary
person presence. Use --k 6 to reduce sensitivity or --k 3 to increase it.

The headless detector publishes ACTIVITY_LEVEL twice per second and detected/cleared
transitions. HTTP runs on a separate thread. On reconnection it publishes the current
status instead of replaying old movement. After CSI interruption it recalibrates.

## 3. React (another terminal)

Set these values in frontend/.env.local, retaining any unrelated existing settings:

```dotenv
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173/dashboard. Confirm Wi-Fi CSI, Sensor connected, changing
Activity score, and Active/Idle. Movement during ASSEMBLE creates one warning per
machine cycle; movement in other stages creates an informational alert. Unplug RX:
within five seconds Sensor disconnected is shown and Active is cleared. Reconnect
the detector and keep the area empty for recalibration. Stop/restart the backend:
React reconnects and the detector resends its current status.
