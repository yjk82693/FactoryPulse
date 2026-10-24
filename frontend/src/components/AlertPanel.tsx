import type { Alert } from "../types/contract";
import { AlertItem } from "./AlertItem";
import styles from "./AlertPanel.module.css";

interface Props {
  alerts: Alert[];
  voiceEnabled: boolean;
  onAcknowledge: (alertId: string) => void;
  pendingId: string | null;
}

export function AlertPanel({ alerts, voiceEnabled, onAcknowledge, pendingId }: Props) {
  const open = alerts
    .filter((item) => !item.acknowledged)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const rest = alerts
    .filter((item) => item.acknowledged)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const ordered = [...open, ...rest];

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className={`panel-title ${styles.title}`}>Operational alerts · {open.length} open</div>
      {ordered.length === 0 ? (
        <div className={styles.empty}>No alerts</div>
      ) : (
        <div className={styles.list}>
          {ordered.map((alert) => (
            <AlertItem
              key={alert.alert_id}
              alert={alert}
              voiceEnabled={voiceEnabled}
              onAcknowledge={onAcknowledge}
              busy={pendingId === alert.alert_id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
