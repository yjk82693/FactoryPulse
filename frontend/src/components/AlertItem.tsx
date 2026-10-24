import type { Alert } from "../types/contract";
import { relativeTime } from "../lib/time";
import { VoiceButton } from "./VoiceButton";
import { getConfig } from "../config";
import styles from "./AlertItem.module.css";

const SEVERITY_ICON: Record<Alert["severity"], string> = {
  info: "ℹ",
  warning: "▲",
  critical: "■",
};

interface Props {
  alert: Alert;
  voiceEnabled: boolean;
  fetchVoice: ((alertId: string) => Promise<Blob>) | null;
  onAcknowledge: (alertId: string) => void;
  busy: boolean;
}

export function AlertItem({ alert, voiceEnabled, fetchVoice, onAcknowledge, busy }: Props) {
  const config = getConfig();

  return (
    <article className={`${styles.item} ${styles[alert.severity]}`}>
      <div className={styles.head}>
        <span className={styles.sev}>
          <span aria-hidden="true">{SEVERITY_ICON[alert.severity]} </span>
          {alert.severity} · {alert.rule}
        </span>
        <span className={styles.meta} title={alert.created_at}>
          {relativeTime(alert.created_at)}
        </span>
      </div>
      <div className={styles.message}>{alert.message}</div>
      <div className={styles.meta}>Cycle {alert.cycle_id}</div>
      <div className={styles.actions}>
        <button
          className={styles.ack}
          type="button"
          disabled={alert.acknowledged || busy}
          onClick={() => onAcknowledge(alert.alert_id)}
        >
          {alert.acknowledged ? "Acknowledged" : "Acknowledge"}
        </button>
        <VoiceButton
          alertId={alert.alert_id}
          demoMode={config.demoMode}
          voiceEnabled={voiceEnabled}
          fetchVoice={fetchVoice}
        />
      </div>
    </article>
  );
}
