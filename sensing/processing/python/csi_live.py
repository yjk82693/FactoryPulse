"""
Live CSI viewer + simple motion/presence detector for the ESP32-S3 receiver.

Usage:
    python csi_live.py --port COM5                 (Windows)
    python csi_live.py --port /dev/cu.usbserial-X  (Mac)
    python csi_live.py --port COM5 --save empty.csv --label empty

Keep the room EMPTY for the first few seconds (calibration).
Close the PlatformIO serial monitor first, only one program can use the port.
"""
import argparse
import threading
import time
from collections import deque

import numpy as np
import serial
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# L-LTF layout on ESP32: array index 0..31 = subcarrier 0..31, 32..63 = -32..-1.
# Keep the 52 real data subcarriers, ordered -26..-1, 1..26 (drops DC and guards).
VALID_IDX = list(range(38, 64)) + list(range(1, 27))


def parse_line(line):
    """Return (rssi, amplitude array) or None."""
    if not line.startswith("CSI,"):
        return None
    parts = line.strip().split(",", 5)
    if len(parts) != 6:
        return None
    try:
        rssi = int(parts[2])
        length = int(parts[4])
        vals = np.array(parts[5].split(), dtype=np.int16)
    except ValueError:
        return None
    if length < 128 or len(vals) < 128:
        return None
    vals = vals[:128].reshape(64, 2)          # (imag, real) pairs
    amp = np.hypot(vals[:, 0], vals[:, 1]).astype(np.float32)
    return rssi, amp[VALID_IDX]


def reader(ser, frames, rssis, stats, save_file, label, stop, rec):
    while not stop.is_set():
        try:
            raw = ser.readline()
        except Exception:
            break          # port closed while reading, just exit quietly
        if not raw:
            continue
        line = raw.decode(errors="ignore")
        parsed = parse_line(line)
        if parsed is None:
            if line.strip() and not line.startswith("CSI"):
                print("[board]", line.strip())
            continue
        rssi, amp = parsed
        frames.append(amp)
        rssis.append(rssi)
        stats["count"] += 1
        now = time.time()
        if save_file and rec["start"] <= now < rec["end"]:
            save_file.write(f"{now:.4f},{label}," + line.split(",", 1)[1])
            rec["saved"] += 1


def motion_score(window):
    """Mean over subcarriers of the std over time of normalized amplitude."""
    a = np.asarray(window)
    a = a / (a.mean(axis=1, keepdims=True) + 1e-6)   # per-frame normalize (fights gain jumps)
    return float(a.std(axis=0).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=921600)
    ap.add_argument("--window", type=float, default=1.0, help="seconds per motion window")
    ap.add_argument("--calib", type=float, default=8.0, help="seconds of empty-room calibration")
    ap.add_argument("--k", type=float, default=4.0, help="threshold = mean + k*std of baseline")
    ap.add_argument("--rate", type=int, default=100, help="expected packets per second")
    ap.add_argument("--save", help="CSV file to record raw CSI lines")
    ap.add_argument("--label", default="unlabeled", help="label written with --save")
    ap.add_argument("--delay", type=float, default=5.0,
                    help="seconds to wait before saving starts (time to get in position)")
    ap.add_argument("--duration", type=float, default=0,
                    help="seconds to record, then close automatically (0 = until you close the window)")
    args = ap.parse_args()

    if plt.get_backend().lower() == "agg":
        raise SystemExit(
            "This Python can't open plot windows (no Tk GUI support).\n"
            "You are probably using PlatformIO's built-in Python.\n"
            "Run with your normal Python instead, e.g.:\n"
            "    py -m pip install -r requirements.txt\n"
            f"    py csi_live.py --port {args.port}")

    ser = serial.Serial(args.port, args.baud, timeout=1)
    history = 10 * args.rate                     # 10 s shown in the heatmap
    frames = deque(maxlen=history)
    rssis = deque(maxlen=history)
    scores = deque(maxlen=60 * 10)               # last ~60 s of scores
    stats = {"count": 0, "t0": time.time()}
    calib = {"scores": [], "threshold": None, "start": None}

    save_file = open(args.save, "a") if args.save else None
    rec_start = time.time() + (args.delay if save_file else 0)
    rec = {"start": rec_start,
           "end": rec_start + args.duration if args.duration > 0 else float("inf"),
           "saved": 0}
    if save_file:
        print(f"Recording label '{args.label}' to {args.save}, starts in {args.delay:.0f}s")
    stop = threading.Event()
    threading.Thread(target=reader, args=(ser, frames, rssis, stats, save_file, args.label, stop, rec),
                     daemon=True).start()

    win = max(10, int(args.window * args.rate))

    fig, (ax_hm, ax_sc) = plt.subplots(2, 1, figsize=(10, 7), gridspec_kw={"height_ratios": [2, 1]})
    img = ax_hm.imshow(np.zeros((52, history)), aspect="auto", origin="lower",
                       cmap="viridis", interpolation="nearest")
    ax_hm.set_ylabel("subcarrier (-26..26)")
    ax_hm.set_xlabel("packets (last 10 s)")
    (line_sc,) = ax_sc.plot([], [], lw=1.5)
    thr_line = ax_sc.axhline(0, color="r", ls="--", lw=1)
    ax_sc.set_ylabel("motion score")
    ax_sc.set_xlabel("updates")
    status = fig.suptitle("Waiting for CSI...", fontsize=16)

    def update(_):
        n = len(frames)
        if n < win:
            status.set_text(f"Waiting for CSI... ({stats['count']} packets)")
            return img, line_sc, status

        data = np.array(frames)
        hm = np.zeros((52, history))
        hm[:, -n:] = data.T
        img.set_data(hm)
        img.set_clim(np.percentile(data, 2), np.percentile(data, 98))

        s = motion_score(list(frames)[-win:])
        scores.append(s)
        line_sc.set_data(range(len(scores)), scores)
        ax_sc.set_xlim(0, max(len(scores), 10))
        ax_sc.set_ylim(0, max(max(scores) * 1.2, 1e-3))

        rate = stats["count"] / max(time.time() - stats["t0"], 1e-6)
        info = f"{rate:.0f} pkt/s, RSSI {rssis[-1]} dBm"
        if save_file:
            now = time.time()
            if now < rec["start"]:
                info += f"\nREC '{args.label}' starts in {rec['start'] - now:.0f}s"
            elif now < rec["end"]:
                left = "" if rec["end"] == float("inf") else f", {rec['end'] - now:.0f}s left"
                info += f"\nREC '{args.label}': {rec['saved']} rows{left}"
            else:
                plt.close(fig)
                return img, line_sc, status

        if calib["threshold"] is None:
            if calib["start"] is None:
                calib["start"] = time.time()
            calib["scores"].append(s)
            left = args.calib - (time.time() - calib["start"])
            if left > 0:
                status.set_text(f"CALIBRATING, keep room empty ({left:.0f}s)   {info}")
                status.set_color("orange")
            else:
                b = np.array(calib["scores"])
                calib["threshold"] = b.mean() + args.k * b.std()
                print(f"Baseline {b.mean():.4f} +/- {b.std():.4f}, threshold {calib['threshold']:.4f}")
        else:
            thr_line.set_ydata([calib["threshold"]] * 2)
            if s > calib["threshold"]:
                status.set_text(f"MOTION / PERSON DETECTED   {info}")
                status.set_color("red")
            else:
                status.set_text(f"EMPTY   {info}")
                status.set_color("green")
        return img, line_sc, status

    _anim = FuncAnimation(fig, update, interval=100, cache_frame_data=False)
    try:
        plt.tight_layout()
        plt.show()
    finally:
        stop.set()
        ser.close()
        if save_file:
            save_file.close()
            print(f"Saved {rec['saved']} rows with label '{args.label}' to {args.save}")


if __name__ == "__main__":
    main()