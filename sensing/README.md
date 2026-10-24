# Sensing: ESP32 Wi-Fi CSI → FactoryPulse events

Owner: Developer A. Contract: [`docs/event-schema.md`](../docs/event-schema.md) v1.3, sections 4, 5, 15.

```
[ESP32-S3 TX, SoftAP] ~~~ Wi-Fi ~~~ [ESP32-S3 RX] --USB serial--> csi_stream.py --POST /api/events--> backend
                                                     X-Sensor-Id: csi-rx-01, machine_id: assembly_01
```

## What this measures, and what it does not

The RX pings the TX ~100 times per second and reports Channel State Information (CSI) for each reply: 52 data subcarriers of amplitude. `csi_stream.py` turns the last second of CSI into one **motion score**: how much the radio channel between the two boards is changing.

- It **does** respond to people or objects moving near the TX–RX path. Body movement gives a large response; a hand wave gives a small one unless it is right on the path.
- It **does not** identify people, machines, or locations. It cannot tell which machine is moving, and it does not detect machine faults. Nothing here has been tested against machine behavior.
- A person standing still can look like an empty area. Treat the output as "motion near the cell", not "a person is present".

## Sensor identity (for Developer B)

| Item | Value | Where it lives |
|---|---|---|
| Physical sensor id | `csi-rx-01` | env `SENSOR_ID` on backend and sensing host |
| Bound machine (ingest) | `assembly_01` | hard-coded in `csi_stream.py` (`MACHINE_ID`); contract §5 |
| Ingest key | secret | env `SENSOR_INGEST_KEY` on both sides, never committed |
| Method | `wifi_csi` | every payload |
| Radio link | SSID `CSI_AP`, channel 6, 20 MHz, WPA2 | `sensing/processing/csi_tx/src/main.c`, `csi_rx/src/main.c` |
| Serial | RX UART port (CH343), 921600 baud after boot | `csi_rx` firmware switches baud itself |

One physical sensor = one TX + RX pair. The two boards are not separate sensors. A Console sensing link (`dedicated` or `shared_zone`) is configuration only and does not change what this sensor observes or which `machine_id` it may post (contract frozen decision #3).

**Calibration requirements for the Console:** calibration is per installation and must be redone whenever either board moves, the room layout changes, or the Wi-Fi channel changes. `--save-calibration cal.json` writes the measured baseline, threshold, packet rate, and RSSI. Those numbers can go in a Console calibration record's `notes` (contract §14: state + notes only, no CSI blob). They describe this placement's noise floor, not an RF fingerprint of any machine.

## Physical placement

- Boards 2–3 m apart, same height (~1 m, roughly torso height), clear line of sight, antennas facing each other.
- The sensitive region is roughly an ellipse around the straight line between TX and RX, strongest near the line and near each board. Motion well off that line gives little signal.
- Tape both boards down. Moving either board changes the baseline: recalibrate.
- Power the TX from any USB source (it only needs 5 V). The RX must be on the laptop running `csi_stream.py` via its **UART/COM** port.
- Keep fans, doors, and walkways out of the TX–RX path if possible.

## Repeatable demo setup

Prerequisites: both boards flashed (see `processing/README.md`), backend running per [`docs/live-csi.md`](../docs/live-csi.md) §1, Python with `pip install -r sensing/processing/python/requirements.txt`.

1. **Power TX.** Phone Wi-Fi list should show `CSI_AP`.
2. **Plug RX** into the laptop UART port. Find the port: `python -m serial.tools.list_ports` (Windows `COMx`). Close any serial monitor.
3. **Check raw CSI (optional, 30 s):** `python sensing/processing/python/csi_live.py --port COM4`. Expect ~90–100 pkt/s and RSSI −35 to −55 dBm. Walk through the path: score should jump. Close the window.
4. **Calibrate with the area empty (20 s):**
   ```powershell
   $env:SENSOR_INGEST_KEY = '<same key as backend>'
   python sensing/processing/python/csi_stream.py --port COM4 --save-calibration cal.json
   ```
   Leave the TX–RX area empty until the log says `Calibrated: ...`. If it says `Calibration looks disturbed`, someone moved; it retries automatically (up to 3 attempts). Ctrl+C after calibrating if you only wanted the file.
5. **Run for the demo** (reuses the empty-room calibration, so it can start with people around):
   ```powershell
   python sensing/processing/python/csi_stream.py --port COM4 --load-calibration cal.json
   ```
   Expect `Backend OK: posting to .../api/events`, then a status line every 10 s.
6. **Verify in the Dashboard (Live Mode):** sensor **connected**, method **Wi-Fi CSI**, score moving. Walk through the path for 3+ seconds: `ACTIVITY_DETECTED` in the log, Active on the dashboard, and an `ACTIVITY_REVIEW` (during ASSEMBLE) or `ACTIVITY_INFO` alert. Step away: `ACTIVITY_CLEARED` after ~2 s of quiet.
7. **Show link loss:** unplug RX. Log prints `LINK LOST`; within 5 s the dashboard shows **Sensor disconnected**. Plug back in: log prints `Serial open`, then `LINK RECOVERED ... keeping calibration`.

If step 3 shows < 50 pkt/s, change `AP_CHANNEL` in `csi_tx` (1, 6, or 11; pick the least crowded), reflash TX, and recalibrate.

## Detection logic

| Stage | Behavior | Flag (default) |
|---|---|---|
| Score | 1 s window; per-frame normalized amplitude (removes AGC jumps); mean over subcarriers of std over time | `--window 1` |
| Calibration | Empty area; threshold = median + k × robust sigma (1.4826 × MAD), at least 1.5 × median. A short walk-by during calibration does not inflate it. Clearly disturbed calibrations are rejected and retried. | `--calib 20`, `--k 6` |
| Transient vs sustained | `ACTIVITY_DETECTED` only after the score stays above threshold for 2 s. Shorter excursions are logged as `transient motion ignored` and only appear in `ACTIVITY_LEVEL`. Because the 1 s window stretches any burst by ~1 s, sustain must be longer than the window. | `--sustain 2` |
| Clear | `ACTIVITY_CLEARED` after 2 s below a lower clear level (60% of the way from baseline to threshold), so it does not flicker at the threshold. | `--clear 2` |
| Level | `ACTIVITY_LEVEL` every 0.5 s (contract: ~2/s) with `baseline` | |
| Mapping | Score, threshold, baseline use `x/(1+x)` to fit the 0..1 payload range | |

Tuning: too many false detections → raise `--k` (8) or `--sustain` (3). Missing real motion → lower `--k` (4). Always recalibrate after changing placement.

Payloads contain exactly the contract fields (`activity_score`, `method`, plus `baseline` / `threshold`). No `sensing_link_id`, machine guesses, or heatmaps (contract §0.1 #4).

## Connection loss and recovery

| Failure | What happens |
|---|---|
| CSI stops (TX off, RX reset, interference) for > 2 s | `LINK LOST` logged; publishing stops; backend marks sensor disconnected after 5 s (contract §7) |
| CSI resumes within 60 s | `LINK RECOVERED`, calibration kept, active state kept so a pending `ACTIVITY_CLEARED` still goes out |
| CSI resumes after > 60 s | Recalibrates (area must be empty) |
| RX unplugged (serial error) | Port reopened every 1 s until it comes back |
| Backend down | Events older than 10 s are dropped (no stale motion replayed); when the backend returns, the current state is re-sent as one `ACTIVITY_DETECTED` or `ACTIVITY_CLEARED` |
| 401 / 403 from backend | Logged with a hint to check `SENSOR_ID` / `SENSOR_INGEST_KEY` |
| Firmware sequence gaps | Counted as `lost` in the status line |

## Limitations and false positives

**Shared-zone ambiguity.** One TX–RX link sees one region. If two machines (or a machine and a walkway) are inside that region, their motion adds into the same score. The sensor cannot say which one moved. With a `shared_zone` link, any per-machine interpretation is a hypothesis for operator review. Even a `dedicated` link is not isolation: radio waves reflect off walls and equipment, so motion outside the drawn zone can still change the score.

**Known false-positive sources:**
- People walking near (not through) the path, including behind thin walls
- Fans, moving doors, curtains, robot vacuums, pets
- Moving metal objects (carts, laptops, chairs)
- Other 2.4 GHz traffic on the same channel; microwave ovens
- Bumping or touching either board or its cable
- Baseline drift over long sessions (temperature, furniture moved): recalibrate before a demo

**Known false negatives:** a person standing still; small motion far from the path; very slow motion.

At a crowded venue, keep the boards ~2 m apart and the path away from foot traffic.

## Verification status

| What | Real hardware | Recorded real CSI, replayed | Synthetic only |
|---|---|---|---|
| TX SoftAP boots, RX connects, CSI streams (89–98 pkt/s, RSSI −41 to −44 dBm) | **Yes** (2026-10-24) | | |
| Live plot responds to body movement (`csi_live.py`) | **Yes** | | |
| 90 s recording, 0 sequence gaps, ~98 pkt/s | **Yes** | | |
| `csi_stream.py` events accepted by real FastAPI over HTTP; sensor connected, `ACTIVITY_REVIEW` during ASSEMBLE; disconnected 5 s after stop | | **Yes** | |
| CSI link loss (4 s gap) → `LINK LOST` / `RECOVERED`, calibration kept | | **Yes** | |
| Backend killed and restarted mid-stream → state resynced | | **Yes** | |
| Robust calibration, transient rejection, hysteresis, payload fields, link logic | | | **Yes** (unit tests) |
| `csi_stream.py` on live serial → backend → **Dashboard** | **Not yet** | | |
| Serial unplug/replug reconnect | **Not yet** | | |
| Empty-room calibration numbers with the new method | **Not yet** | | |
| False-positive rate, detection range, any machine-level behavior | **Not tested** | | |

The recorded file is labeled `walking` but includes pauses, so it is useful for pipeline testing, not for measuring accuracy.

## Tests

From the repo root (backend deps enable the integration test; otherwise it is skipped):

```bash
python -m unittest discover -s sensing/tests
python -m unittest backend.test_live
```

Replay a recording without hardware:

```bash
python sensing/processing/python/csi_stream.py --replay data.csv --dry-run --speed 0 --calib 10
```

Recordings (`*.csv`) and calibration files stay local; they are git-ignored under `sensing/`.
