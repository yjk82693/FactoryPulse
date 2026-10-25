# Figure fall CSI experiment

`csi_stream.py` now defaults to a 0.2-second window, 50ms detection sustain,
and up to 100 score evaluations per second. Firmware already requests 100
pings/second; Python settings cannot force the radio to deliver that rate.

Fix both sensors and put the figure in its standing position. Start a fresh
20-second calibration without touching the figure, sensors, or cables. Keep
people and other motion away during calibration and the drop trial.

## Compare windows and detection times

Run one command at a time from the repository root. Keep the existing sensor
ingest key environment variable. Recalibrate for every trial configuration.

```powershell
# 0.2-second window, 50ms sustain
python sensing/processing/python/csi_stream.py --port COM10 --backend http://127.0.0.1:8000 --score-mode subcarrier-delta --window 0.2 --sustain 0.05 --score-delta 0.01 --clear 0.3 --eval-hz 100

# 0.5-second window, 50ms sustain
python sensing/processing/python/csi_stream.py --port COM10 --backend http://127.0.0.1:8000 --score-mode subcarrier-delta --window 0.5 --sustain 0.05 --score-delta 0.01 --clear 0.3 --eval-hz 100
```

Repeat each with `--sustain 0.1` for 100ms. Repeat multiple drops and quiet
control trials per setting; record detections, misses, quiet false triggers,
received packet rate, and detection latency. A longer window dilutes brief
changes and retains them longer. Sustain measures time above the windowed
score threshold, not the physical duration of a fall.

## Scoring

1. Normalize each frame's 52 amplitudes by that frame's mean to suppress common
   gain changes.
2. Calculate adjacent-frame amplitude differences separately for each subcarrier.
3. Calculate the RMS difference over the selected window for each subcarrier.
4. Average only the strongest three subcarriers (`--top-subcarriers 3`).

A localized response therefore contributes much more than it did to the
legacy mean over all 52 subcarriers. Top-one scoring is available with
`--top-subcarriers 1`, but is more susceptible to one noisy carrier.

`--score-delta 0.01` detects an absolute raw-score deviation from the stationary
calibration baseline of at least 0.01, in either direction. It overrides the
adaptive `--k` threshold. Without this flag, threshold selection uses the median
plus `k` robust sigmas, with a floor of 1.5 times the median. Clearing retains
the existing 60% hysteresis and `--clear` quiet duration.

The new score has a different distribution from the old mean-standard-deviation
score: old numeric thresholds and saved calibrations are not interchangeable.
Saved calibrations include scoring mode, window, and subcarrier count; mismatched
loads are rejected. Recalibrate after placement or radio changes too.

## Rates and diagnostics

- Startup logs show the requested scoring settings.
- Calibration logs report measured RX packets/second and frames/window.
- Status reports RX packet rate, sequence gaps (`lost`), and strongest subcarrier
  RMS values using firmware subcarrier indices.
- Below 80 packets/second, calibration logs suggest comparing 100ms sustain.
  A zero sequence-gap count does not establish 100Hz reception.
- `--eval-hz 100` is a processing ceiling. Evaluation is packet driven and cannot
  exceed the actual received packet rate. Short windows require at least four
  frames and 80% of the configured time span before scoring.
- Graph levels are published every 0.1 seconds (`--level-period`); detection edges
  are submitted immediately. Slow backend requests can still coalesce levels.
- Contract payloads still use `x/(1+x)` for score, baseline, and threshold.
  The terminal's raw status score and graph score therefore differ slightly.

For comparison with the old detector, explicitly select its settings:

```powershell
python sensing/processing/python/csi_stream.py --port COM10 --backend http://127.0.0.1:8000 --score-mode mean-std --window 1 --sustain 2 --clear 2 --eval-hz 10 --level-period 0.5
```

This is an experimental motion detector, not a validated fall classifier.
Synthetic sparse 60ms bursts are tested, but physical figure drops and their
detection rate still require hardware trials.
