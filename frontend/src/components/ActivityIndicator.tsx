import { useEffect, useState } from "react";
import type { State } from "../types/contract";
import { parseValidTimestamp, relativeTime } from "../lib/time";
import styles from "./ActivityIndicator.module.css";

interface Props {
  sensor: State["sensor"];
  backendLive: boolean;
}

export function ActivityIndicator({ sensor, backendLive }: Props) {
  const [, setTick] = useState(0);
  const updatedAt = parseValidTimestamp(sensor.last_update_at);
  useEffect(() => {
    if (updatedAt === null) {
      return;
    }
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [updatedAt]);

  const methodLabel = sensor.method === "simulated" ? "Simulated sensor" : "Wi-Fi CSI";
  const fresh = backendLive && sensor.connected;
  const activity = sensor.active ? "Active" : "Idle";
  const link = !backendLive
    ? "Cached reading"
    : sensor.connected
      ? "Sensor connected"
      : "Sensor disconnected";

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className="panel-title">Activity score</div>
      <div className={`${styles.score} ${fresh ? "" : styles.stale}`}>{sensor.activity_score.toFixed(2)}</div>
      <div className={styles.unit}>{fresh ? "0.00–1.00" : "Last reading (stale)"}</div>
      <div className={`${styles.state} ${fresh && sensor.active ? styles.active : styles.idle}`}>
        {fresh ? activity : "Not live"}
      </div>
      <div className={styles.method}>{methodLabel}</div>
      <div className={`${styles.link} ${backendLive && !sensor.connected ? styles.down : ""}`}>{link}</div>
      {updatedAt !== null ? (
        <div className={styles.updated} title={sensor.last_update_at ?? undefined}>
          Updated {relativeTime(sensor.last_update_at as string)}
        </div>
      ) : null}
    </section>
  );
}
