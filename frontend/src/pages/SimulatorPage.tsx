import { useEffect, useMemo, useRef, useState } from "react";
import { ConsoleChrome } from "../components/console/ConsoleChrome";
import chrome from "../components/console/ConsoleChrome.module.css";
import { DEFAULT_DETECTOR, initialDetector, stepDetector } from "../console/detection";
import { anomalyScore, generateSeries } from "../console/simulation";
import { useConsoleCatalog, useConsoleStore, useSelectedMachine } from "../console/ConsoleContext";
import type { DetectorConfig, DetectorSnapshot, ReviewAlert, SimScenario } from "../console/types";

const SCENARIOS: { id: SimScenario; label: string }[] = [
  { id: "normal", label: "Normal repeated cycles" },
  { id: "short_disturbance", label: "Short disturbance" },
  { id: "sustained_deviation", label: "Sustained deviation" },
  { id: "missing_motion", label: "Missing expected motion" },
];

export function SimulatorPage() {
  const store = useConsoleStore();
  const catalog = useConsoleCatalog();
  const selected = useSelectedMachine();
  const machine = selected ?? catalog.machines[0] ?? null;
  const profile = catalog.profiles.find((item) => item.id === machine?.profileId) ?? null;
  const [scenario, setScenario] = useState<SimScenario>("sustained_deviation");
  const [seed, setSeed] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [persist, setPersist] = useState(DEFAULT_DETECTOR.persistTicks);
  const [detector, setDetector] = useState<DetectorSnapshot>(initialDetector);
  const [alerts, setAlerts] = useState<ReviewAlert[]>([]);
  const detectorRef = useRef(detector);
  const alertsRef = useRef(alerts);
  const cursorRef = useRef(0);
  const idRef = useRef(0);
  detectorRef.current = detector;
  alertsRef.current = alerts;

  const series = useMemo(
    () => (profile ? generateSeries(profile.phases, scenario, seed, 48) : []),
    [profile, scenario, seed],
  );

  function resetRun(): void {
    setPlaying(false);
    cursorRef.current = 0;
    setCursor(0);
    const fresh = initialDetector();
    detectorRef.current = fresh;
    alertsRef.current = [];
    idRef.current = 0;
    setDetector(fresh);
    setAlerts([]);
  }

  useEffect(() => {
    resetRun();
  }, [scenario, seed, machine?.id, persist]);

  useEffect(() => {
    if (!playing || !machine) {
      return;
    }
    const config: DetectorConfig = { ...DEFAULT_DETECTOR, persistTicks: persist };
    const timer = window.setInterval(() => {
      if (cursorRef.current >= series.length) {
        return;
      }
      const next = cursorRef.current + 1;
      cursorRef.current = next;
      const point = series[next - 1];
      if (point) {
        const score = anomalyScore(point.expected, point.observed);
        const stepped = stepDetector(
          detectorRef.current,
          score,
          next - 1,
          config,
          alertsRef.current,
          machine.id,
          () => {
            idRef.current += 1;
            return `sim-${machine.id}-${idRef.current}`;
          },
        );
        detectorRef.current = stepped.detector;
        alertsRef.current = stepped.alerts;
        setDetector(stepped.detector);
        setAlerts(stepped.alerts);
      }
      setCursor(next);
    }, 180);
    return () => window.clearInterval(timer);
  }, [playing, series, machine, persist]);

  const visible = series.slice(0, Math.max(cursor, 1));
  const latest = series[Math.max(cursor - 1, 0)];

  return (
    <ConsoleChrome>
      <main className={chrome.main}>
        <section className="panel">
          <div className="panel-title">Motion simulation &amp; calibration view</div>
          <p className="panel-subtitle">
            Synthetic expected vs observed activity. Deterministic seed. Not live CSI. Anomaly scores are
            hypotheses for review.
          </p>
        </section>
        <section className={`panel ${chrome.form}`}>
          <label>
            Machine
            <select
              value={machine?.id ?? ""}
              onChange={(event) => store.selectMachine(event.target.value)}
            >
              {catalog.machines.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scenario
            <select value={scenario} onChange={(event) => setScenario(event.target.value as SimScenario)}>
              {SCENARIOS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seed
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Persistence (ticks)
            <input
              type="number"
              min={2}
              max={20}
              value={persist}
              onChange={(event) => setPersist(Number(event.target.value) || 6)}
            />
          </label>
          <div className={chrome.actions}>
            <button className={chrome.primary} type="button" onClick={() => setPlaying(true)}>
              Start
            </button>
            <button className={chrome.ghost} type="button" onClick={() => setPlaying(false)}>
              Pause
            </button>
            <button className={chrome.ghost} type="button" onClick={resetRun}>
              Reset
            </button>
          </div>
        </section>
        {!profile ? (
          <p className={chrome.empty}>Select a machine with a motion profile.</p>
        ) : (
          <div className={chrome.split}>
            <section className="panel">
              <div className="panel-title">Expected vs observed (synthetic)</div>
              <SeriesChart points={visible} />
              <p className={chrome.meta}>
                Tick {cursor}/{series.length} · expected {latest?.expected.toFixed(2) ?? "—"} · observed{" "}
                {latest?.observed.toFixed(2) ?? "—"} · score {detector.score.toFixed(2)} · {detector.phase}
              </p>
            </section>
            <section className="panel">
              <div className="panel-title">Review alerts</div>
              {alerts.length === 0 ? (
                <p className={chrome.empty}>No review alerts. Short spikes should not open one.</p>
              ) : (
                <div className={chrome.list}>
                  {alerts.map((alert) => (
                    <article key={alert.id} className={chrome.row}>
                      <strong>{alert.clearedAtTick === null ? "OPEN" : "CLEARED"}</strong>
                      <span className={chrome.meta}>
                        ticks {alert.openedAtTick}
                        {alert.clearedAtTick !== null ? `–${alert.clearedAtTick}` : ""} · score {alert.score}
                      </span>
                      <span>{alert.message}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </ConsoleChrome>
  );
}

function SeriesChart({ points }: { points: { t: number; expected: number; observed: number }[] }) {
  const w = 480;
  const h = 160;
  const maxT = Math.max(points[points.length - 1]?.t ?? 1, 1);
  const path = (key: "expected" | "observed") =>
    points
      .map((point, index) => {
        const x = (point.t / maxT) * (w - 16) + 8;
        const y = h - 12 - point[key] * (h - 24);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="180" role="img" aria-label="Expected versus observed activity">
      <rect width={w} height={h} fill="#101214" rx="8" />
      <path d={path("expected")} fill="none" stroke="#22c55e" strokeWidth="2" />
      <path d={path("observed")} fill="none" stroke="#22d3ee" strokeWidth="2" />
    </svg>
  );
}
