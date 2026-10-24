"""Headless CSI detector -> existing FactoryPulse sensor event contract."""
import argparse
from collections import deque
from datetime import datetime, timezone
import json
import os
import threading
import time
from urllib.request import Request, urlopen
from uuid import uuid4

import numpy as np
import serial


def amplitude(line):
    if not line.startswith('CSI,'):
        return None
    try:
        parts = line.strip().split(',', 5)
        if len(parts) != 6 or int(parts[4]) < 128:
            return None
        values = np.array(parts[5].split(), dtype=np.int16)
        if len(values) < 128:
            return None
        iq = values[:128].reshape(64, 2)
        amp = np.hypot(iq[:, 0], iq[:, 1])
        return amp[list(range(38, 64)) + list(range(1, 27))]
    except (ValueError, IndexError):
        return None


def score(frames):
    values = np.asarray(frames)
    values = values / (values.mean(axis=1, keepdims=True) + 1e-6)
    return float(values.std(axis=0).mean())


def bounded(value):
    # Monotonic map to the contract's 0..1 range; threshold uses the same map.
    return value / (1 + value)


def publish(args, shared, lock, stop):
    previous = None
    while not stop.wait(.5):
        with lock:
            sample = shared.get('sample')
        if sample is None or time.monotonic() - sample[0] > 2:
            previous = None
            continue
        _, value, threshold, baseline, active = sample
        def send(kind, payload):
            event = dict(event_id=str(uuid4()), timestamp=datetime.now(timezone.utc).isoformat(),
                         source='sensor', event_type=kind, machine_id='assembly_01',
                         payload=dict(activity_score=value, method='wifi_csi', **payload))
            request = Request(args.backend.rstrip('/') + '/api/events',
                              data=json.dumps(event).encode(), method='POST',
                              headers={'Content-Type': 'application/json',
                                       'X-Sensor-Id': args.sensor_id, 'X-Sensor-Key': args.sensor_key})
            with urlopen(request, timeout=2) as response:
                if response.status != 202:
                    raise RuntimeError('Unexpected ingest response')
        try:
            send('ACTIVITY_LEVEL', dict(baseline=baseline))
            if active != previous:
                send('ACTIVITY_DETECTED' if active else 'ACTIVITY_CLEARED',
                     dict(threshold=threshold) if active else {})
                previous = active
        except Exception as error:
            # Send current status after reconnect; do not replay stale motion.
            previous = None
            print(f'Backend unavailable ({type(error).__name__}); retrying current status.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', default=os.getenv('SERIAL_PORT'))
    parser.add_argument('--backend', default=os.getenv('BACKEND_URL', 'http://localhost:8000'))
    parser.add_argument('--sensor-id', default=os.getenv('SENSOR_ID', 'csi-rx-01'))
    parser.add_argument('--sensor-key', default=os.getenv('SENSOR_INGEST_KEY'))
    parser.add_argument('--baud', type=int, default=921600)
    parser.add_argument('--window', type=float, default=1.)
    parser.add_argument('--calib', type=float, default=8.)
    parser.add_argument('--k', type=float, default=4.)
    args = parser.parse_args()
    if not args.port or not args.sensor_key:
        parser.error('Set SERIAL_PORT/--port and SENSOR_INGEST_KEY.')
    if min(args.window, args.calib, args.k) <= 0:
        parser.error('window, calib and k must be positive')
    frames, calibration = deque(), []
    start = None
    last_update = 0
    last_packet = None
    threshold = baseline = None
    shared, lock, stop = {}, threading.Lock(), threading.Event()
    worker = threading.Thread(target=publish, args=(args, shared, lock, stop), daemon=True)
    print('Keep the area empty during calibration.', flush=True)
    try:
        with serial.Serial(args.port, args.baud, timeout=.25) as port:
            worker.start()
            while True:
                amp = amplitude(port.readline().decode(errors='ignore'))
                current = time.monotonic()
                if amp is None:
                    continue
                if last_packet is not None and current - last_packet > 2:
                    frames.clear()
                    calibration.clear()
                    start = threshold = baseline = None
                    with lock:
                        shared.clear()
                    print('CSI resumed; recalibrating in an empty area.', flush=True)
                last_packet = current
                frames.append((current, amp))
                while frames and frames[0][0] < current - args.window:
                    frames.popleft()
                if len(frames) < 10 or current - frames[0][0] < args.window * .8:
                    continue
                if current - last_update < .1:
                    continue
                last_update = current
                value = score([frame for _, frame in frames])
                if threshold is None:
                    if start is None:
                        start = current
                    calibration.append(value)
                    if current - start >= args.calib:
                        baseline = float(np.mean(calibration))
                        threshold = max(baseline + args.k * float(np.std(calibration)), 1e-6)
                        print(f'Calibrated: baseline={baseline:.4f}, threshold={threshold:.4f}', flush=True)
                    continue
                with lock:
                    shared['sample'] = (current, bounded(value), bounded(threshold),
                                        bounded(baseline), value > threshold)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        if worker.is_alive():
            worker.join(timeout=5)


if __name__ == '__main__':
    main()
