import type { State } from "../types/contract";
import styles from "./ActivityIndicator.module.css";

export function ActivityIndicator({ sensor }: { sensor: State["sensor"] }) {
  const methodLabel = sensor.method === "simulated" ? "Simulated sensor" : "Wi-Fi CSI";
  const activity = sensor.active ? "Active" : "Idle";
  return (
    <section className={`panel ${styles.wrap}`}>
      <div className="panel-title">Activity score</div>
      <div className={styles.score}>{sensor.activity_score.toFixed(2)}</div>
      <div className={styles.unit}>0.00–1.00</div>
      <div className={`${styles.state} ${sensor.active ? styles.active : styles.idle}`}>{activity}</div>
      <div className={styles.method}>{methodLabel}</div>
      <div className={`${styles.link} ${sensor.connected ? "" : styles.down}`}>
        {sensor.connected ? "Sensor connected" : "Sensor disconnected"}
      </div>
    </section>
  );
}
