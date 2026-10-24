import { useState } from "react";
import type { Alert, Event, Step } from "../types/contract";
import { AlertItem } from "./AlertItem";
import styles from "./AlertPanel.module.css";

const PREVIEW_OPEN = 3;
const SEVERITY_RANK: Record<Alert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

interface Props {
  alerts: Alert[];
  voiceEnabled: boolean;
  fetchVoice: ((alertId: string) => Promise<Blob>) | null;
  explainEnabled?: boolean;
  fetchExplain?: ((alertId: string) => Promise<{ explanation: string }>) | null;
  machineId?: string | null;
  currentStep?: Step | null;
  events?: Event[];
  onAcknowledge: (alertId: string) => void;
  pendingId: string | null;
}

export function AlertPanel({
  alerts,
  voiceEnabled,
  fetchVoice,
  explainEnabled = false,
  fetchExplain = null,
  machineId = null,
  currentStep = null,
  events = [],
  onAcknowledge,
  pendingId,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const open = alerts
    .filter((item) => !item.acknowledged)
    .sort((a, b) => {
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rank !== 0) {
        return rank;
      }
      return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
    });
  const acknowledged = alerts
    .filter((item) => item.acknowledged)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const preview = open.slice(0, PREVIEW_OPEN);
  const visible = expanded ? [...open, ...acknowledged] : preview;
  const hiddenCount = alerts.length - visible.length;

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className={`panel-title ${styles.title}`}>Operational alerts · {open.length} open</div>
      {visible.length === 0 ? (
        <div className={styles.empty}>{alerts.length === 0 ? "No alerts" : "No open alerts"}</div>
      ) : (
        <div className={styles.list}>
          {visible.map((alert) => (
            <AlertItem
              key={alert.alert_id}
              alert={alert}
              voiceEnabled={voiceEnabled}
              fetchVoice={fetchVoice}
              explainEnabled={explainEnabled}
              fetchExplain={fetchExplain}
              machineId={machineId}
              currentStep={currentStep}
              events={events}
              onAcknowledge={onAcknowledge}
              busy={pendingId === alert.alert_id}
            />
          ))}
        </div>
      )}
      {hiddenCount > 0 || expanded ? (
        <button
          className={styles.more}
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </section>
  );
}
