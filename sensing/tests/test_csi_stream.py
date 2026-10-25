"""Sensing pipeline tests. No ESP32 hardware: synthetic CSI only.

Run from the repo root:
    python -m unittest discover -s sensing/tests -t .
"""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import threading

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('csi_stream', ROOT / 'sensing/processing/python/csi_stream.py')
cs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cs)

RATE = 100          # packets per second, like the real RX (~98 measured)
DT = 1.0 / RATE


class SyntheticChannel:
    """Stable per-subcarrier amplitude plus noise; 'motion' modulates it over time."""

    def __init__(self, seed=0):
        self.rng = np.random.default_rng(seed)
        self.base = 10 + 5 * np.sin(np.linspace(0, 3, 52)) + self.rng.uniform(0, 2, 52)
        self.phase = self.rng.uniform(0, 2 * np.pi, 52)

    def frame(self, t, motion=0.0):
        noise = self.rng.normal(0, 0.15, 52)
        wobble = motion * np.sin(2 * np.pi * 1.5 * t + self.phase) * self.rng.uniform(0.5, 1.5, 52)
        gain = 1 + self.rng.normal(0, 0.01)            # small AGC jitter
        return np.clip(gain * self.base * (1 + 0.35 * wobble) + noise, 0, None)


def quiet_log(_msg):
    pass


def feed(det, chan, start, seconds, motion=0.0, seq0=0, drop=()):
    """Feed packets; returns (end_time, next_seq, events)."""
    events, t, seq = [], start, seq0
    for i in range(int(seconds * RATE)):
        t = start + i * DT
        det.tick(t)
        if i in drop:
            seq += 1
            continue
        events += det.packet(t, seq, -42, chan.frame(t, motion(t) if callable(motion) else motion))
        seq += 1
    return start + seconds, seq, events


def kinds(events):
    return [k for k, _ in events]


def calibrated_detector(seconds=10, **kw):
    kw.setdefault('calib_s', seconds)
    det = cs.Detector(log=quiet_log, **kw)
    chan = SyntheticChannel()
    t, seq, _ = feed(det, chan, 0.0, seconds + 1.5)
    assert det.cal is not None, 'calibration did not finish'
    return det, chan, t, seq


class ParsingTests(unittest.TestCase):
    def test_raw_and_recorded_lines(self):
        values = ' '.join(['3', '4'] * 64)
        raw = cs.parse_line(f'CSI,7,-41,123,128,{values}\r\n')
        rec = cs.parse_line(f'1792870613.2681,walking,7,-41,123,128,{values}\r\r\n')
        for parsed in (raw, rec):
            self.assertEqual(parsed[0], 7)
            self.assertEqual(parsed[1], -41)
            self.assertEqual(len(parsed[2]), 52)
            self.assertTrue(np.allclose(parsed[2], 5.0))

    def test_rejects_garbage(self):
        for line in ('', '\n', 'CSI,broken', 'I (123) csi_rx: hi', 'CSI,1,-40,0,64,1 2 3',
                     '\x00\xff garbled boot text', 'CSI,1,-40,0,128,' + 'x ' * 128):
            self.assertIsNone(cs.parse_line(line))

    def test_backend_compat_names(self):
        frame = cs.amplitude('CSI,0,-50,0,128,' + ' '.join(['3', '4'] * 64))
        self.assertAlmostEqual(cs.score([frame] * 20), 0.0, places=6)
        self.assertLess(cs.bounded(100), 1.0)


class CalibrationTests(unittest.TestCase):
    def test_robust_to_short_disturbance(self):
        rng = np.random.default_rng(1)
        clean = rng.normal(0.04, 0.004, 200)
        dirty = clean.copy()
        dirty[50:56] = 0.4                      # someone walks past for ~0.6 s
        robust = cs.Calibration.from_scores(dirty, k=6)
        naive = dirty.mean() + 4 * dirty.std()  # old method
        self.assertLess(robust.threshold, 0.08)
        self.assertGreater(naive, 0.15)
        self.assertFalse(robust.noisy)

    def test_flags_contaminated_calibration(self):
        rng = np.random.default_rng(2)
        s = np.concatenate([rng.normal(0.04, 0.004, 120), rng.normal(0.3, 0.05, 80)])
        self.assertTrue(cs.Calibration.from_scores(s).noisy)

    def test_threshold_floor_on_very_stable_channel(self):
        cal = cs.Calibration.from_scores([0.05] * 100)
        self.assertGreaterEqual(cal.threshold, 0.075)

    def test_disturbed_calibration_retries(self):
        det = cs.Detector(calib_s=5, max_calib_attempts=2, log=quiet_log)
        chan = SyntheticChannel(3)
        t, seq, _ = feed(det, chan, 0, 6.5, motion=lambda t: 1.0 if 2.0 < t < 4.5 else 0.0)
        self.assertIsNone(det.cal, 'disturbed first attempt must not be accepted')
        feed(det, chan, t, 7, seq0=seq)
        self.assertIsNotNone(det.cal)
        self.assertFalse(det.cal.noisy)

    def test_save_and_load_roundtrip(self):
        det, *_ = calibrated_detector()
        restored = cs.Calibration.from_dict(det.cal.to_dict())
        self.assertAlmostEqual(restored.threshold, det.cal.threshold)
        self.assertIn('packet_rate', det.cal.to_dict())


class DetectionTests(unittest.TestCase):
    def test_quiet_area_stays_clear(self):
        det, chan, t, seq = calibrated_detector()
        _, _, events = feed(det, chan, t, 60, seq0=seq)
        self.assertNotIn('ACTIVITY_DETECTED', kinds(events))

    def test_transient_is_not_detected(self):
        det, chan, t, seq = calibrated_detector(sustain_s=2.0)
        # Motion burst short enough that the 1 s score window rises above threshold briefly.
        _, _, events = feed(det, chan, t, 10, seq0=seq, motion=lambda x: 1.0 if t + 2 < x < t + 2.3 else 0.0)
        self.assertNotIn('ACTIVITY_DETECTED', kinds(events))
        self.assertGreaterEqual(det.tracker.transients, 1)

    def test_sustained_motion_detected_once_then_cleared(self):
        det, chan, t, seq = calibrated_detector(sustain_s=2.0, clear_s=2.0)
        t, seq, events = feed(det, chan, t, 8, seq0=seq, motion=0.8)
        self.assertEqual(kinds(events).count('ACTIVITY_DETECTED'), 1)
        _, _, events = feed(det, chan, t, 8, seq0=seq)
        self.assertEqual(kinds(events).count('ACTIVITY_CLEARED'), 1)
        self.assertNotIn('ACTIVITY_DETECTED', kinds(events))

    def test_level_rate_about_two_per_second(self):
        det, chan, t, seq = calibrated_detector()
        _, _, events = feed(det, chan, t, 10, seq0=seq)
        n = kinds(events).count('ACTIVITY_LEVEL')
        self.assertTrue(18 <= n <= 21, n)

    def test_payloads_match_contract_fields_and_ranges(self):
        det, chan, t, seq = calibrated_detector()
        t, seq, events = feed(det, chan, t, 6, seq0=seq, motion=1.0)
        _, _, more = feed(det, chan, t, 6, seq0=seq)
        allowed = dict(ACTIVITY_LEVEL={'activity_score', 'method', 'baseline', 'threshold'},
                       ACTIVITY_DETECTED={'activity_score', 'method', 'threshold'},
                       ACTIVITY_CLEARED={'activity_score', 'method'})
        for kind, payload in events + more:
            self.assertEqual(set(payload), allowed[kind])
            self.assertEqual(payload['method'], 'wifi_csi')
            self.assertTrue(0 <= payload['activity_score'] <= 1)
        env = cs.envelope(*events[0])
        self.assertEqual(set(env), {'event_id', 'timestamp', 'source', 'event_type', 'machine_id', 'payload'})
        self.assertEqual(env['source'], 'sensor')
        self.assertEqual(env['machine_id'], 'assembly_01')
        self.assertTrue(env['timestamp'].endswith('Z'))


class FastFallTests(unittest.TestCase):
    def test_sparse_subcarrier_response_is_not_diluted(self):
        frames = np.full((30, 52), 10.0)
        frames[10:16, :2] += 5
        changes = cs.subcarrier_changes(frames)
        self.assertEqual(changes.shape, (52,))
        self.assertGreater(changes[0], changes[10] * 10)
        self.assertGreater(cs.change_score(frames, 3), cs.score(frames) * 2)

    def test_common_gain_changes_do_not_trigger_score(self):
        base = np.linspace(5, 15, 52)
        frames = np.array([base * gain for gain in (1, 2, 0.5, 3, 1)])
        self.assertLess(cs.change_score(frames), 1e-6)

    def test_short_sparse_burst_at_both_windows_and_durations(self):
        for window in (0.2, 0.5):
            for sustain in (0.05, 0.1):
                with self.subTest(window=window, sustain=sustain):
                    det = cs.Detector(window_s=window, calib_s=2, k=3,
                                      sustain_s=sustain, clear_s=0.3, eval_hz=100,
                                      score_mode='subcarrier-delta', score_delta=0.01,
                                      log=quiet_log)
                    rng = np.random.default_rng(123)
                    detections, clears, quiet_detections = [], [], []
                    for seq in range(600):
                        t = seq / 100
                        frame = np.full(52, 10.0) + rng.normal(0, 0.005, 52)
                        # Only two subcarriers respond, for 60ms.
                        if 4 <= t < 4.06:
                            frame[:2] += 5
                        for kind, _ in det.packet(t, seq, -42, frame):
                            if kind == 'ACTIVITY_DETECTED':
                                detections.append(t)
                                if t < 4:
                                    quiet_detections.append(t)
                            elif kind == 'ACTIVITY_CLEARED':
                                clears.append(t)
                    self.assertEqual(quiet_detections, [])
                    self.assertEqual(len(detections), 1)
                    self.assertLessEqual(detections[0] - 4, sustain + 0.03)
                    self.assertEqual(len(clears), 1)
                    self.assertFalse(det.tracker.active)
                    restored = cs.Calibration.from_dict(det.cal.to_dict())
                    self.assertEqual(restored.extra['score_mode'], 'subcarrier-delta')
                    self.assertEqual(restored.extra['window_s'], window)
                    self.assertEqual(restored.extra['score_delta'], 0.01)

    def test_default_cli_uses_fast_scoring(self):
        args = cs.build_parser().parse_args([])
        self.assertEqual(args.score_mode, 'subcarrier-delta')
        self.assertEqual(args.window, 0.2)
        self.assertEqual(args.eval_hz, 100)
        self.assertEqual(args.sustain, 0.05)

    def test_scoring_follows_actual_50_or_100_hz_reception(self):
        for rate in (50, 100):
            with self.subTest(rate=rate):
                det = cs.Detector(window_s=0.2, calib_s=1, eval_hz=100,
                                  score_mode='subcarrier-delta', log=quiet_log)
                for seq in range(2 * rate):
                    det.packet(seq / rate, seq, -42, np.full(52, 10.0))
                self.assertAlmostEqual(det.link.rate(), rate)
                self.assertIsNotNone(det.cal)
                # The old 100ms throttle would only collect about 11 samples.
                self.assertGreaterEqual(det.cal.samples, rate)
                self.assertLessEqual(det.cal.samples, rate + 2)

    def test_legacy_calibration_cannot_be_used_with_new_score(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'calibration.json'
            import json
            path.write_text(json.dumps(cs.Calibration(0.02, 0.001, 0.03, 3, 100, False).to_dict()))
            args = cs.build_parser().parse_args(['--dry-run', '--replay', 'unused.csv',
                                                 '--load-calibration', str(path)])
            with self.assertRaisesRegex(SystemExit, 'different scoring/window'):
                cs.run(args, quiet_log)


class LinkTests(unittest.TestCase):
    def test_link_loss_stops_events_and_short_outage_keeps_calibration(self):
        det, chan, t, seq = calibrated_detector()
        cal = det.cal
        # 3 s of silence: tick only.
        for i in range(300):
            det.tick(t + i * DT)
        self.assertFalse(det.link.up)
        self.assertEqual(det.link.outages, 1)
        _, _, events = feed(det, chan, t + 3, 5, seq0=0)   # RX rebooted: seq restarts
        self.assertIs(det.cal, cal)
        self.assertIn('ACTIVITY_LEVEL', kinds(events))

    def test_long_outage_recalibrates(self):
        det, chan, t, seq = calibrated_detector(reuse_calibration_s=5)
        for i in range(20):
            det.tick(t + i)
        feed(det, chan, t + 20, 2, seq0=seq + 1)
        self.assertIsNone(det.cal)

    def test_active_state_survives_short_outage_so_clear_is_sent(self):
        det, chan, t, seq = calibrated_detector()
        t, seq, events = feed(det, chan, t, 5, seq0=seq, motion=1.0)
        self.assertTrue(det.tracker.active)
        for i in range(300):
            det.tick(t + i * DT)
        _, _, events = feed(det, chan, t + 3, 8, seq0=seq + 300)
        self.assertIn('ACTIVITY_CLEARED', kinds(events))

    def test_sequence_gap_counts_lost_packets(self):
        det = cs.Detector(calib_s=2, log=quiet_log)
        feed(det, SyntheticChannel(), 0, 2, drop=range(10, 15))
        self.assertEqual(det.link.lost, 5)


class PublisherTests(unittest.TestCase):
    def test_slow_backend_coalesces_levels_and_prioritizes_transition(self):
        entered, release = threading.Event(), threading.Event()
        delivered = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self):
                return b''

        def slow_post(request, timeout):
            import json
            delivered.append(json.loads(request.data))
            if len(delivered) == 1:
                entered.set()
                if not release.wait(3):
                    raise RuntimeError('test backend was not released')
            return Response()

        with patch.object(cs, 'urlopen', side_effect=slow_post):
            pub = cs.Publisher('http://localhost:8000', 'test', 'test', log=quiet_log)
            try:
                pub.submit('ACTIVITY_LEVEL', dict(activity_score=0.01))
                self.assertTrue(entered.wait(2))
                for i in range(300):
                    pub.submit('ACTIVITY_LEVEL', dict(activity_score=i / 1000))
                pub.submit('ACTIVITY_DETECTED', dict(activity_score=0.3, threshold=0.05))
                pub.submit('ACTIVITY_LEVEL', dict(activity_score=0.4))
            finally:
                release.set()
                pub.close()
        self.assertEqual([e['event_type'] for e in delivered],
                         ['ACTIVITY_LEVEL', 'ACTIVITY_DETECTED', 'ACTIVITY_LEVEL'])
        self.assertEqual(delivered[-1]['payload']['activity_score'], 0.4)
        self.assertGreater(pub.coalesced, 0)
        self.assertFalse(pub.resync_pending)
        self.assertFalse(pub.resync_ready)
        self.assertEqual(pub.failed, 0)


class ReplayTests(unittest.TestCase):
    def test_replay_csv_dry_run(self):
        chan = SyntheticChannel(4)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'rec.csv')
            with open(path, 'w') as f:
                for i in range(25 * RATE):
                    t = 1792870000 + i * DT
                    amp = chan.frame(t, 1.0 if i > 16 * RATE else 0.0)
                    # rebuild 64 subcarriers in firmware order: [0..31 | -32..-1]
                    iq = np.zeros((64, 2), int)
                    for k, idx in enumerate(cs.VALID_IDX):
                        iq[idx, 1] = int(round(amp[k]))
                    values = ' '.join(map(str, iq.ravel()))
                    f.write(f'{t:.4f},empty,{i},-42,{i * 10000},128,{values}\r\r\n')
            args = cs.build_parser().parse_args(['--replay', path, '--speed', '0', '--dry-run',
                                                 '--calib', '10'])
            with contextlib.redirect_stdout(io.StringIO()):
                det, pub = cs.run(args, log=quiet_log)
        self.assertIsNotNone(det.cal)
        self.assertGreaterEqual(det.stats['detected'], 1)
        self.assertGreater(pub.sent, 10)


try:
    os.environ.setdefault('AUTH_DISABLED', 'true')
    os.environ['SIM_ENABLED'] = 'false'
    os.environ.setdefault('SENSOR_INGEST_KEY', 'test-only-key')
    import sys
    sys.path.insert(0, str(ROOT))
    from fastapi.testclient import TestClient
    from backend import main as backend
except Exception:          # backend deps not installed: skip integration
    backend = None


@unittest.skipIf(backend is None, 'backend dependencies not installed')
class BackendIntegrationTests(unittest.TestCase):
    """Detector output posted to the real FastAPI app (in-process, no network)."""

    def test_detector_events_accepted_and_update_state(self):
        backend.hub = backend.Hub()
        headers = {'X-Sensor-Id': 'csi-rx-01', 'X-Sensor-Key': os.environ['SENSOR_INGEST_KEY']}
        det, chan, t, seq = calibrated_detector()
        t, seq, events = feed(det, chan, t, 4, seq0=seq)
        t, seq, active = feed(det, chan, t, 5, seq0=seq, motion=1.0)
        _, _, cleared = feed(det, chan, t, 6, seq0=seq)
        with TestClient(backend.app) as client:
            for kind, payload in events + active:
                r = client.post('/api/events', json=cs.envelope(kind, payload), headers=headers)
                self.assertEqual(r.status_code, 202, r.text)
            sensor = client.get('/api/state').json()['sensor']
            self.assertTrue(sensor['connected'])
            self.assertTrue(sensor['active'])
            self.assertEqual(sensor['method'], 'wifi_csi')
            self.assertGreaterEqual(len(client.get('/api/alerts').json()), 1)
            for kind, payload in cleared:
                r = client.post('/api/events', json=cs.envelope(kind, payload), headers=headers)
                self.assertEqual(r.status_code, 202, r.text)
            self.assertFalse(client.get('/api/state').json()['sensor']['active'])


if __name__ == '__main__':
    unittest.main()
