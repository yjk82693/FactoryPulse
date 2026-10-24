import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Method } from "../types/contract";
import type { ActivitySample } from "../state/streamReducer";
import { DEFAULT_THRESHOLD } from "../state/streamReducer";
import styles from "./ActivityChart.module.css";

interface Props {
  samples: ActivitySample[];
  method: Method | null;
  connected: boolean;
}

export function ActivityChart({ samples, method, connected }: Props) {
  const now = Date.now();
  const threshold = samples[samples.length - 1]?.threshold ?? DEFAULT_THRESHOLD;
  const methodLabel =
    method === "simulated" ? "Simulated sensor" : method === "wifi_csi" ? "Wi-Fi CSI" : "Sensor activity";
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
            {methodLabel} · last 120s
          </div>
          <div className="panel-subtitle">Activity score 0–1 with detection threshold</div>
        </div>
        {!connected ? <div className={styles.disconnected}>Sensor disconnected</div> : null}
      </div>
      {data.length === 0 ? (
        <div className={styles.empty}>Waiting for activity samples</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#233247" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[now - 120000, now]}
              tickFormatter={(value: number) => `${Math.round((value - now) / 1000)}s`}
              stroke="#64748b"
              minTickGap={32}
            />
            <YAxis domain={[0, 1]} width={32} stroke="#64748b" />
            <Tooltip
              contentStyle={{ background: "#151F32", border: "1px solid #2B3B52" }}
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
                fill="rgba(56, 189, 248, 0.12)"
                strokeOpacity={0}
              />
            ))}
            <ReferenceLine y={threshold} stroke="#F59E0B" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#38BDF8"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
