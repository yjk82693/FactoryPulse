"""Headless CSI detector -> FactoryPulse sensor events (Contract v1.3, section 4/5).

Reads ESP32-S3 RX serial CSI (or a recorded file), scores motion, and POSTs
ACTIVITY_LEVEL / ACTIVITY_DETECTED / ACTIVITY_CLEARED to POST /api/events.
Payloads use only the contract fields; everything else is local logging.

What the score means: change in the Wi-Fi channel between the two boards over
the last second. It reflects motion near the TX-RX path. It does not identify
people, machines, machine faults, or locations, and a still person can look
like an empty area.

Live:    python csi_stream.py --port COM4
Replay:  python csi_stream.py --replay data.csv --dry-run --speed 0
"""
import argparse
from collections import deque
from datetime import datetime, timezone
import json
import os
import queue
import sys
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import numpy as np

# ESP32 L-LTF layout: index 0..31 = subcarrier 0..31, 32..63 = -32..-1.
# Keep the 52 data subcarriers (-26..-1, 1..26); drop DC and guard bands.
VALID_IDX = list(range(38, 64)) + list(range(1, 27))
MACHINE_ID = 'assembly_01'   # contract: ingest machine_id must equal the sensor's bound machine
METHOD = 'wifi_csi'


# ---------------------------------------------------------------------------
# Signal processing (names kept stable: backend/test_live.py imports them)
# ---------------------------------------------------------------------------
def parse_line(line):
    """Return (seq, rssi, amplitude[52]) for a CSI line, else None.

    Accepts raw firmware lines ``CSI,seq,rssi,ts,len,values`` and lines saved by
    csi_live.py ``pc_time,label,seq,rssi,ts,len,values``.
    """
    line = line.strip()
    if not line:
        return None
    if not line.startswith('CSI,'):
        parts = line.split(',', 2)
        if len(parts) < 3:
            return None
        line = 'CSI,' + parts[2]
    parts = line.split(',', 5)
    try:
        if len(parts) != 6 or int(parts[4]) < 128:
            return None
        values = np.array(parts[5].split(), dtype=np.int16)
        if len(values) < 128:
            return None
        iq = values[:128].reshape(64, 2)
        return int(parts[1]), int(parts[2]), np.hypot(iq[:, 0], iq[:, 1])[VALID_IDX]
    except (ValueError, IndexError):
        return None


def amplitude(line):
    parsed = parse_line(line)
    return None if parsed is None else parsed[2]


def score(frames):
    """Mean over subcarriers of the std over time of per-frame-normalized amplitude."""
    values = np.asarray(frames, dtype=float)
    values = values / (values.mean(axis=1, keepdims=True) + 1e-6)   # removes AGC gain jumps
    return float(values.std(axis=0).mean())


def bounded(value):
    """Monotonic map to the contract's 0..1 range; threshold and baseline use the same map."""
    return value / (1 + value)


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------
class Calibration:
    """Empty-area baseline from raw (unbounded) scores.

    Robust statistics: median and MAD, so a short disturbance during calibration
    does not inflate the threshold the way mean + k*std does.
    """

    def __init__(self, baseline, sigma, threshold, k, samples, noisy, created_at=None, extra=None):
        self.baseline, self.sigma, self.threshold = baseline, sigma, threshold
        self.k, self.samples, self.noisy = k, samples, noisy
        self.created_at = created_at or utc_now()
        self.extra = extra or {}

    @classmethod
    def from_scores(cls, scores, k=6.0, min_ratio=1.5, noisy_ratio=3.0):
        s = np.asarray(scores, dtype=float)
        median = float(np.median(s))
        sigma = 1.4826 * float(np.median(np.abs(s - median)))
        threshold = max(median + k * sigma, median * min_ratio, 1e-4)
        # Contaminated if the busier tail is far above the quietest quarter
        # (clean channel noise gives p90/p25 around 1.3).
        p25, p90 = np.percentile(s, [25, 90])
        noisy = bool(p90 > noisy_ratio * p25)
        return cls(median, sigma, threshold, k, len(s), noisy)

    def to_dict(self):
        return dict(baseline=self.baseline, sigma=self.sigma, threshold=self.threshold, k=self.k,
                    samples=self.samples, noisy=self.noisy, created_at=self.created_at,
                    baseline_bounded=bounded(self.baseline), threshold_bounded=bounded(self.threshold),
                    **self.extra)

    @classmethod
    def from_dict(cls, d):
        return cls(d['baseline'], d['sigma'], d['threshold'], d['k'], d['samples'], d['noisy'],
                   d.get('created_at'))


# ---------------------------------------------------------------------------
# Transient vs sustained activity
# ---------------------------------------------------------------------------
class ActivityTracker:
    """Hysteresis state machine over the motion score.

    * Rising: score must stay above ``threshold`` for ``sustain_s`` seconds.
      The 1 s score window already stretches any burst by ~1 s, so sustain must
      be longer than the window to reject short bursts. Shorter excursions are counted as transients and never reach the backend
      as ACTIVITY_DETECTED (they are still visible in ACTIVITY_LEVEL).
    * Falling: score must stay below a lower clear level for ``clear_s`` seconds,
      which stops DETECTED/CLEARED chatter around the threshold.
    """

    def __init__(self, calibration, sustain_s=2.0, clear_s=2.0, clear_ratio=0.6):
        self.cal, self.sustain_s, self.clear_s = calibration, sustain_s, clear_s
        self.clear_level = calibration.baseline + clear_ratio * (calibration.threshold - calibration.baseline)
        self.active = False
        self.above_since = self.below_since = self.last_above = None
        self.transients = 0
        self.last_transient_s = 0.0

    def update(self, now, value):
        """Return 'detected', 'cleared', 'transient', or None."""
        if not self.active:
            if value > self.cal.threshold:
                if self.above_since is None:
                    self.above_since = now
                self.last_above = now
                if now - self.above_since >= self.sustain_s:
                    self.active, self.above_since, self.below_since = True, None, None
                    return 'detected'
            elif self.above_since is not None:
                self.last_transient_s = self.last_above - self.above_since
                self.above_since = None
                self.transients += 1
                return 'transient'
            return None
        if value < self.clear_level:
            if self.below_since is None:
                self.below_since = now
            if now - self.below_since >= self.clear_s:
                self.active, self.below_since = False, None
                return 'cleared'
        else:
            self.below_since = None
        return None


# ---------------------------------------------------------------------------
# Link health
# ---------------------------------------------------------------------------
class LinkMonitor:
    """Packet rate, firmware sequence gaps, and CSI silence (link loss)."""

    def __init__(self, timeout_s=2.0, rate_window_s=5.0):
        self.timeout_s, self.rate_window_s = timeout_s, rate_window_s
        self.last_packet = None
        self.last_seq = None
        self.times = deque()
        self.lost = 0
        self.up = False
        self.down_since = None
        self.outages = 0

    def packet(self, now, seq):
        """Record a packet. Return outage seconds if this packet ends an outage."""
        recovered = None
        if not self.up and self.down_since is not None:
            recovered = now - self.down_since
            self.down_since = None
            self.last_seq = None          # RX may have rebooted; seq restarts
        self.up = True
        if self.last_seq is not None and seq > self.last_seq + 1:
            self.lost += seq - self.last_seq - 1
        self.last_seq = seq
        self.last_packet = now
        self.times.append(now)
        while self.times and self.times[0] < now - self.rate_window_s:
            self.times.popleft()
        return recovered

    def check(self, now):
        """Return True once when the link transitions to lost."""
        if self.up and self.last_packet is not None and now - self.last_packet > self.timeout_s:
            self.up = False
            self.down_since = self.last_packet
            self.outages += 1
            return True
        return False

    def rate(self):
        if len(self.times) < 2:
            return 0.0
        span = self.times[-1] - self.times[0]
        return (len(self.times) - 1) / span if span > 0 else 0.0


# ---------------------------------------------------------------------------
# Detector pipeline (pure: no I/O, driven by an explicit clock)
# ---------------------------------------------------------------------------
class Detector:
    def __init__(self, window_s=1.0, calib_s=20.0, k=6.0, sustain_s=2.0, clear_s=2.0,
                 level_period_s=0.5, link_timeout_s=2.0, reuse_calibration_s=60.0,
                 calibration=None, max_calib_attempts=3, log=print):
        self.window_s, self.calib_s, self.k = window_s, calib_s, k
        self.sustain_s, self.clear_s = sustain_s, clear_s
        self.level_period_s, self.reuse_s = level_period_s, reuse_calibration_s
        self.max_calib_attempts = max_calib_attempts
        self.log = log
        self.link = LinkMonitor(link_timeout_s)
        self.frames = deque()
        self.calib_scores, self.calib_start, self.calib_attempts = [], None, 0
        self.rssi = deque(maxlen=500)
        self.cal = calibration
        self.tracker = ActivityTracker(calibration, sustain_s, clear_s) if calibration else None
        self.last_eval = self.last_level = None
        self.value = None
        self.stats = dict(detected=0, cleared=0, levels=0)
        if calibration:
            self.log(f'Using saved calibration: baseline={calibration.baseline:.4f} '
                     f'threshold={calibration.threshold:.4f} (from {calibration.created_at})')

    # -- event helpers -------------------------------------------------------
    def _event(self, kind, **payload):
        payload = dict(activity_score=round(bounded(self.value), 4), method=METHOD, **payload)
        if kind == 'ACTIVITY_LEVEL':
            self.stats['levels'] += 1
        return kind, payload

    def _restart_calibration(self, reason):
        self.cal = self.tracker = None
        self.calib_scores, self.calib_start = [], None
        self.log(f'{reason} Recalibrating: keep the TX-RX area empty for {self.calib_s:.0f}s.')

    def current_edge(self):
        """Edge event describing the current state (used to resync the backend)."""
        if self.tracker.active:
            return self._event('ACTIVITY_DETECTED', threshold=round(bounded(self.cal.threshold), 4))
        return self._event('ACTIVITY_CLEARED')

    # -- inputs --------------------------------------------------------------
    def tick(self, now):
        """Call periodically even without packets. Returns events to send."""
        if self.link.check(now):
            self.frames.clear()
            self.value = None
            self.log(f'LINK LOST: no CSI for {self.link.timeout_s:.0f}s. Not publishing; '
                     'backend marks sensor disconnected after 5s.')
        return []

    def packet(self, now, seq, rssi, amp):
        """Feed one parsed CSI packet. Returns a list of (event_type, payload)."""
        events = []
        recovered = self.link.packet(now, seq)
        if recovered is not None:
            self.frames.clear()
            self.last_eval = self.last_level = None
            if self.cal is not None and recovered <= self.reuse_s:
                # Keep the active flag so a backend still showing activity gets a CLEARED later.
                self.tracker.above_since = self.tracker.below_since = None
                self.log(f'LINK RECOVERED after {recovered:.1f}s; keeping calibration.')
            else:
                self._restart_calibration(f'LINK RECOVERED after {recovered:.1f}s.')
        self.rssi.append(rssi)
        self.frames.append((now, amp))
        while self.frames and self.frames[0][0] < now - self.window_s:
            self.frames.popleft()
        if len(self.frames) < 10 or now - self.frames[0][0] < self.window_s * 0.8:
            return events
        if self.last_eval is not None and now - self.last_eval < 0.1:
            return events
        self.last_eval = now
        self.value = score([f for _, f in self.frames])

        if self.cal is None:
            if self.calib_start is None:
                self.calib_start = now
                self.calib_attempts += 1
                self.log(f'Calibrating ({self.calib_s:.0f}s). Keep the TX-RX area empty.')
            self.calib_scores.append(self.value)
            if now - self.calib_start >= self.calib_s:
                cal = Calibration.from_scores(self.calib_scores, self.k)
                if cal.noisy and self.calib_attempts < self.max_calib_attempts:
                    self.log(f'Calibration looks disturbed (motion during calibration?). '
                             f'Attempt {self.calib_attempts}/{self.max_calib_attempts}.')
                    self.calib_scores, self.calib_start = [], None
                    return events
                cal.extra = dict(packet_rate=round(self.link.rate(), 1),
                                 rssi_median=float(np.median(self.rssi)) if self.rssi else None)
                self.cal = cal
                self.tracker = ActivityTracker(cal, self.sustain_s, self.clear_s)
                self.log(f'Calibrated: baseline={cal.baseline:.4f} sigma={cal.sigma:.4f} '
                         f'threshold={cal.threshold:.4f} ({cal.samples} samples'
                         f'{", NOISY - area may not have been empty" if cal.noisy else ""})')
            return events

        change = self.tracker.update(now, self.value)
        if change == 'detected':
            self.stats['detected'] += 1
            events.append(self._event('ACTIVITY_DETECTED', threshold=round(bounded(self.cal.threshold), 4)))
        elif change == 'cleared':
            self.stats['cleared'] += 1
            events.append(self._event('ACTIVITY_CLEARED'))
        elif change == 'transient':
            self.log(f'transient motion ignored ({self.tracker.last_transient_s:.1f}s < '
                     f'{self.sustain_s:.1f}s sustain)')
        if self.last_level is None or now - self.last_level >= self.level_period_s:
            self.last_level = now
            events.insert(0, self._event('ACTIVITY_LEVEL', baseline=round(bounded(self.cal.baseline), 4)))
        return events


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def envelope(kind, payload):
    return dict(event_id=str(uuid4()), timestamp=utc_now(), source='sensor',
                event_type=kind, machine_id=MACHINE_ID, payload=payload)


class Publisher:
    """Non-blocking HTTP sender so serial reading never stalls on the network."""

    def __init__(self, backend, sensor_id, sensor_key, dry_run=False, log=print):
        self.url = backend.rstrip('/') + '/api/events'
        self.headers = {'Content-Type': 'application/json',
                        'X-Sensor-Id': sensor_id, 'X-Sensor-Key': sensor_key or ''}
        self.dry_run, self.log = dry_run, log
        self.queue = queue.Queue(maxsize=200)
        self.max_age_s = 10.0          # never deliver stale motion after an outage
        self.sent = self.failed = self.stale = 0
        self.resync_pending = False    # a send failed; current state must be re-sent
        self.resync_ready = False      # backend reachable again; caller should re-send state
        self.backend_up = None
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def submit(self, kind, payload):
        item = (time.monotonic(), envelope(kind, payload))
        try:
            self.queue.put_nowait(item)
        except queue.Full:
            try:
                self.queue.get_nowait()        # drop oldest; resync restores edge state
            except queue.Empty:
                pass
            self.queue.put_nowait(item)
            self.resync_pending = True

    def _run(self):
        while not self.stop.is_set() or not self.queue.empty():
            try:
                queued_at, event = self.queue.get(timeout=0.2)
            except queue.Empty:
                continue
            if time.monotonic() - queued_at > self.max_age_s:
                self.stale += 1
                self.resync_pending = True
                continue
            if self.dry_run:
                print(json.dumps(event), flush=True)
                self.sent += 1
                continue
            try:
                request = Request(self.url, data=json.dumps(event).encode(), method='POST', headers=self.headers)
                with urlopen(request, timeout=2) as response:
                    response.read()
                self.sent += 1
                if self.backend_up is not True:
                    self.log(f'Backend OK: posting to {self.url}')
                self.backend_up = True
                if self.resync_pending:
                    self.resync_pending, self.resync_ready = False, True
            except HTTPError as error:
                self.failed += 1
                body = error.read().decode(errors='ignore')[:200]
                self.log(f'Backend rejected {event["event_type"]}: HTTP {error.code} {body}')
                if error.code in (401, 403):
                    self.log('Check SENSOR_ID / SENSOR_INGEST_KEY match the backend environment.')
            except Exception as error:
                self.failed += 1
                self.resync_pending = True
                if self.backend_up is not False:
                    self.log(f'Backend unavailable ({type(error).__name__}); will keep trying.')
                self.backend_up = False

    def close(self):
        self.stop.set()
        self.thread.join(timeout=5)


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------
def serial_lines(port_name, baud, log, stop):
    """Yield (now, line) forever; reopen the port if the RX is unplugged."""
    import serial
    while not stop.is_set():
        try:
            with serial.Serial(port_name, baud, timeout=0.25) as port:
                log(f'Serial open: {port_name} @ {baud}')
                while not stop.is_set():
                    raw = port.readline()
                    yield time.monotonic(), raw.decode(errors='ignore') if raw else ''
        except serial.SerialException as error:
            log(f'Serial error on {port_name}: {error}. Retrying in 1s.')
            for _ in range(4):
                if stop.is_set():
                    return
                time.sleep(0.25)
                yield time.monotonic(), ''


def replay_lines(path, speed):
    """Yield (recorded_time, line) from a csi_live.py CSV or a raw serial log."""
    start_wall = start_rec = None
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                if line.startswith('CSI,'):
                    t = int(line.split(',', 4)[3]) / 1e6          # board timestamp, microseconds
                else:
                    t = float(line.split(',', 1)[0])              # csi_live.py PC time
            except (ValueError, IndexError):
                continue
            if start_rec is None:
                start_rec, start_wall = t, time.monotonic()
            if speed > 0:
                delay = (t - start_rec) / speed - (time.monotonic() - start_wall)
                if delay > 0:
                    time.sleep(delay)
            yield t, line


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_argument_group('source')
    src.add_argument('--port', default=os.getenv('SERIAL_PORT'), help='RX serial port (env SERIAL_PORT)')
    src.add_argument('--baud', type=int, default=921600)
    src.add_argument('--replay', help='replay a recorded CSV/serial log instead of serial (testing)')
    src.add_argument('--speed', type=float, default=1.0, help='replay speed; 0 = as fast as possible')
    out = p.add_argument_group('backend')
    out.add_argument('--backend', default=os.getenv('BACKEND_URL', 'http://localhost:8000'))
    out.add_argument('--sensor-id', default=os.getenv('SENSOR_ID', 'csi-rx-01'))
    out.add_argument('--sensor-key', default=os.getenv('SENSOR_INGEST_KEY'))
    out.add_argument('--dry-run', action='store_true', help='print events as JSON instead of POSTing')
    det = p.add_argument_group('detection')
    det.add_argument('--window', type=float, default=1.0, help='score window seconds')
    det.add_argument('--calib', type=float, default=20.0, help='empty-area calibration seconds')
    det.add_argument('--k', type=float, default=6.0, help='threshold = median + k * robust sigma')
    det.add_argument('--sustain', type=float, default=2.0,
                     help='seconds above threshold before DETECTED (must exceed --window)')
    det.add_argument('--clear', type=float, default=2.0, help='seconds quiet before CLEARED')
    det.add_argument('--link-timeout', type=float, default=2.0, help='CSI silence seconds = link lost')
    det.add_argument('--reuse-calibration', type=float, default=60.0,
                     help='keep calibration after outages up to this many seconds')
    cal = p.add_argument_group('calibration file')
    cal.add_argument('--save-calibration', metavar='FILE', help='write calibration JSON after calibrating')
    cal.add_argument('--load-calibration', metavar='FILE', help='skip calibration and use a saved JSON')
    return p


def run(args, log=print):
    for name in ('window', 'calib', 'k', 'sustain', 'clear', 'link_timeout'):
        if getattr(args, name) <= 0:
            raise SystemExit(f'--{name.replace("_", "-")} must be positive')
    if args.sustain <= args.window:
        log(f'Warning: --sustain {args.sustain} <= --window {args.window}; short bursts will be reported.')
    calibration = None
    if args.load_calibration:
        with open(args.load_calibration) as f:
            calibration = Calibration.from_dict(json.load(f))
    detector = Detector(window_s=args.window, calib_s=args.calib, k=args.k, sustain_s=args.sustain,
                        clear_s=args.clear, link_timeout_s=args.link_timeout,
                        reuse_calibration_s=args.reuse_calibration, calibration=calibration, log=log)
    publisher = Publisher(args.backend, args.sensor_id, args.sensor_key, args.dry_run, log)
    stop = threading.Event()
    saved = calibration is not None
    if args.replay:
        source = replay_lines(args.replay, args.speed)
        log(f'Replaying {args.replay} (speed {args.speed or "max"}). Events are timestamped now.')
    else:
        source = serial_lines(args.port, args.baud, log, stop)
    last_status = None
    try:
        for now, line in source:
            detector.tick(now)
            parsed = parse_line(line) if line else None
            if parsed is None:
                if line and not line.startswith('CSI') and not args.replay:
                    text = line.strip()
                    if text and text.isprintable():
                        log(f'[board] {text}')
                continue
            for kind, payload in detector.packet(now, *parsed):
                publisher.submit(kind, payload)
                if kind != 'ACTIVITY_LEVEL':
                    log(f'{kind} score={payload["activity_score"]:.3f}')
            if publisher.resync_ready and detector.tracker is not None and detector.value is not None:
                publisher.resync_ready = False
                kind, payload = detector.current_edge()
                publisher.submit(kind, payload)
                log(f'Resynced backend after outage: {kind}')
            if detector.cal is not None and not saved and args.save_calibration:
                with open(args.save_calibration, 'w') as f:
                    json.dump(detector.cal.to_dict(), f, indent=2)
                log(f'Calibration saved to {args.save_calibration}')
                saved = True
            if last_status is None or now - last_status >= 10:
                last_status = now
                if detector.value is not None:
                    log(f'status: {detector.link.rate():.0f} pkt/s, lost {detector.link.lost}, '
                        f'score {detector.value:.4f}, active {bool(detector.tracker and detector.tracker.active)}, '
                        f'sent {publisher.sent}, failed {publisher.failed}')
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        publisher.close()
        log(f'Summary: {json.dumps(dict(detector.stats, transients=detector.tracker.transients if detector.tracker else 0, outages=detector.link.outages, packets_lost=detector.link.lost, sent=publisher.sent, failed=publisher.failed, stale_dropped=publisher.stale))}')
    return detector, publisher


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.replay and not args.port:
        parser.error('Set --port (or SERIAL_PORT), or use --replay FILE.')
    if not args.dry_run and not args.sensor_key:
        parser.error('Set SENSOR_INGEST_KEY (or --sensor-key), or use --dry-run.')
    log = lambda msg: print(f'[{time.strftime("%H:%M:%S")}] {msg}', file=sys.stderr, flush=True)
    run(args, log)


if __name__ == '__main__':
    main()
