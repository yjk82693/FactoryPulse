import { useEffect, useState } from "react";
import { EXPECTED_MS, type State } from "../types/contract";
import { elapsedMs } from "../lib/time";
import styles from "./MachineStatusCard.module.css";

export function MachineStatusCard({ machine }: { machine: State["machine"] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, []);

  const expected = machine.current_step ? EXPECTED_MS[machine.current_step] : null;
  const elapsed = elapsedMs(machine.step_started_at);
  const over = expected !== null && elapsed !== null && elapsed > expected;
  const ratio = expected && elapsed !== null ? Math.min(1.4, elapsed / expected) : 0;

  return (
    <section className={`panel ${styles.card}`}>
      <div className={styles.kicker}>Assembly cell · {machine.machine_id}</div>
      <div className={styles.row}>
        <div className={`${styles.status} ${styles[machine.status]}`}>{machine.status}</div>
        <div className={styles.step}>{machine.current_step ?? "—"}</div>
      </div>
      <div className={styles.meta}>
        <div>
          <label>Cycle</label>
          <strong>{machine.cycle_id}</strong>
        </div>
        <div>
          <label>Elapsed</label>
          <strong>{elapsed === null ? "—" : `${(elapsed / 1000).toFixed(1)}s`}</strong>
        </div>
        <div>
          <label>Expected</label>
          <strong>{expected === null ? "—" : `${(expected / 1000).toFixed(1)}s`}</strong>
        </div>
      </div>
      {expected !== null ? (
        <div className={styles.bar} aria-label={over ? "Step running longer than expected" : "Step progress"}>
          <div
            className={`${styles.fill} ${over ? styles.over : ""}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      ) : null}
      {machine.simulated ? <div className={styles.sim}>Simulated machine</div> : null}
    </section>
  );
}
