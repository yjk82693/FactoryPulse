import type { OptimizeResult } from "../../optimizer/types";
import styles from "./CostSummary.module.css";

interface Props {
  currentCost: number;
  result: OptimizeResult | null;
  onOptimize: () => void;
  onReset: () => void;
}

function formatCost(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function CostSummary({ currentCost, result, onOptimize, onReset }: Props) {
  return (
    <section className={`panel ${styles.wrap}`}>
      <div className="panel-title">Weighted travel distance</div>
      <p className={styles.objective}>
        Objective: minimize Σ (flow frequency × Manhattan distance in grid cells) over directed workstation
        pairs. Units are weighted grid steps, not meters. This example is not derived from Wi-Fi CSI or live
        machine telemetry.
      </p>
      <div className={styles.metrics}>
        <div>
          <label>Current</label>
          <strong>{formatCost(currentCost)}</strong>
        </div>
        <div>
          <label>Suggested</label>
          <strong>{result ? formatCost(result.optimizedCost) : "—"}</strong>
        </div>
        <div>
          <label>Reduction</label>
          <strong className={result?.improved ? styles.gain : undefined}>
            {result
              ? `${formatCost(result.improvementAbs)} (${result.improvementPct.toFixed(1)}%)`
              : "—"}
          </strong>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={onOptimize}>
          Optimize Layout
        </button>
        <button className={styles.secondary} type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  );
}
