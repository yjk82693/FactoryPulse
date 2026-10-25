# CSI Human Detection (HackPSU)

> Detection pipeline, calibration, demo steps, and limitations: see [`sensing/README.md`](../README.md). This file covers flashing the boards.

Two ESP32-S3 boards:
- **csi_tx**: Wi-Fi access point (the "router"). Just answers pings.
- **csi_rx**: connects to csi_tx, pings it 100x/sec, prints CSI of every reply to serial.
- **python/csi_live.py**: live heatmap + motion score + EMPTY / DETECTED status.

## 0. Before you start
- Label your boards with tape: **TX** and **RX**.
- Your DevKitC-1 has two USB-C ports. Use the one labeled **COM** (or **UART**), not **USB**. The code prints through COM.
- If the board isn't detected on Windows, install the **CP210x** or **CH343** USB driver (check the chip near the COM port).

## 1. Open the TX project
1. VS Code -> PlatformIO icon -> **Open Project** -> select the `csi_tx` folder.
2. Wait for PlatformIO to download the ESP-IDF toolchain (first time only, can take 5 to 15 min).

## 2. Flash TX
1. Plug in the **TX** board (COM port).
2. Bottom toolbar: click **->** (Upload).
3. If upload fails with "Failed to connect": hold **BOOT**, tap **RST**, release **BOOT**, then upload again.
4. Click the plug icon (Serial Monitor). You should see:
   `AP started: SSID=CSI_AP channel=6. Waiting for receiver...`
5. Leave it powered (laptop USB or a phone charger is fine).

## 3. Flash RX
1. Open the `csi_rx` folder as a project the same way.
2. Plug in the **RX** board, Upload.
3. Open Serial Monitor. You should see `Connected to CSI_AP`, `Got IP`, then a fast stream of lines starting with `CSI,`.
4. The TX monitor should now say `Receiver connected`.
5. **Close the Serial Monitor** (trash-can icon) before step 5. Only one program can use the port.

## 4. Python setup (one time)
```
cd python
pip install -r requirements.txt
```
Find the RX port name: PlatformIO sidebar -> **Devices**, or Windows Device Manager -> Ports (e.g. COM5).

## 5. Run the live detector
```
python csi_live.py --port COM5
```
- First 8 seconds: **leave the area between the boards empty** (calibration).
- Then walk between the boards. Status should switch to red DETECTED.
- Title shows packet rate (aim for 80 to 100 pkt/s) and RSSI.

## 6. Record labeled data (for ML later)
```
python csi_live.py --port COM5 --save data.csv --label empty
python csi_live.py --port COM5 --save data.csv --label walking
python csi_live.py --port COM5 --save data.csv --label standing
```
Record 1 to 2 minutes per label. Same CSV, label in column 2.

## Placement
- Boards 2 to 4 m apart, same height (~1 m), line of sight, antennas facing each other.
- Tape them down. Moving them means re-calibrating.

## Troubleshooting
| Problem | Fix |
|---|---|
| Garbage characters in monitor | Monitor speed must be 921600 (already in platformio.ini) |
| RX never connects | Both files must have the same `AP_SSID` / `AP_PASS`; TX must be powered |
| Packet rate below ~50/s | Change `AP_CHANNEL` in csi_tx (try 1 or 11), reflash TX |
| "dropped" warnings | Lower `PING_RATE_HZ` in csi_rx to 50 and use `--rate 50` in Python |
| Too many false detections | Re-run calibration, or raise `--k` (e.g. `--k 6`) |
| No detections | Lower `--k` (e.g. `--k 3`), walk directly through the line between boards |
| Board not showing up | Use the COM port, try another cable (some are charge-only) |
