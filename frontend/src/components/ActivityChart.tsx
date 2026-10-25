import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Method } from "../types/contract";
import { sensorMethodLabel } from "../lib/sensorLabel";
import type { ActivitySample } from "../state/streamReducer";
import styles from "./ActivityChart.module.css";

interface Props {
  samples: ActivitySample[];
  method: Method | null;
  connected: boolean;
  backendLive: boolean;
}

export function ActivityChart({ samples, method, connected, backendLive }: Props) {
  const now = Date.now();
  const methodLabel = sensorMethodLabel(method, samples.length > 0);
  const data = samples.map((sample) => ({
    t: sample.t,
    score: Number(sample.score.toFixed(3)),
    label: new Date(sample.t).toLocaleTimeString(),
  }));

  const regions: { x1: number; x2: number }[] = [];
  let start: number | null = null;
  for (const sample of samples) {
    if (sample.active && start === null) {
      start = sample.t;
    }
    if (!sample.active && start !== null) {
      regions.push({ x1: start, x2: sample.t });
      start = null;
    }
  }
  if (start !== null) {
    regions.push({ x1: start, x2: samples[samples.length - 1]?.t ?? now });
  }

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className={styles.head}>
        <div>
          <div className="panel-title">
            {methodLabel} · last 30s
          </div>
          <div className="panel-subtitle">
            {backendLive && connected
              ? "Activity score 0-0.075; shaded areas show detected activity"
              : data.length > 0
                ? "Frozen last samples · not a live reading"
                : "Activity score 0-0.075; shaded areas show detected activity"}
          </div>
        </div>
        {backendLive && !connected ? <div className={styles.disconnected}>Sensor disconnected</div> : null}
      </div>
      {data.length === 0 ? (
        <div className={styles.empty}>Waiting for activity samples</div>
      ) : (
        <div className={styles.chartBody}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#2a2f38" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[now - 30000, now]}
                allowDataOverflow
                tickFormatter={(value: number) => `${Math.round((value - now) / 1000)}s`}
                stroke="#6d7580"
                minTickGap={32}
              />
              <YAxis
                domain={[0, 0.075]}
                allowDataOverflow
                ticks={[0, 0.015, 0.03, 0.045, 0.06, 0.075]}
                interval={0}
                width={48}
                stroke="#6d7580"
              />
              <Tooltip
                contentStyle={{ background: "#1a1d23", border: "1px solid #323844", color: "#e8eaed" }}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as { label?: string } | undefined;
                  return point?.label ?? "";
                }}
              />
              {regions.map((region) => (
                <ReferenceArea
                  key={`${region.x1}-${region.x2}`}
                  x1={region.x1}
                  x2={region.x2}
                  fill="rgba(34, 211, 238, 0.12)"
                  strokeOpacity={0}
                />
              ))}
              <Line
                type="monotone"
                dataKey="score"
                stroke="#22D3EE"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
