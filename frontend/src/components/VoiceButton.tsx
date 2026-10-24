import { useAlertVoice } from "../hooks/useAlertVoice";
import styles from "./VoiceButton.module.css";

interface Props {
  alertId: string;
  demoMode: boolean;
  voiceEnabled: boolean;
  fetchVoice: ((alertId: string) => Promise<Blob>) | null;
}

export function VoiceButton({ alertId, demoMode, voiceEnabled, fetchVoice }: Props) {
  const liveFetch = demoMode || !voiceEnabled ? null : fetchVoice;
  const voice = useAlertVoice(alertId, liveFetch);

  if (demoMode) {
    return (
      <button className={styles.button} type="button" disabled title="Voice alerts require Live Mode">
        Listen to Alert
      </button>
    );
  }

  if (!voiceEnabled || voice.disabledReason) {
    return (
      <button
        className={styles.button}
        type="button"
        disabled
        title="Voice alerts not configured on server"
      >
        Listen to Alert
      </button>
    );
  }

  const loading = voice.status === "loading";
  const playing = voice.status === "playing";
  const label = loading ? "Generating audio…" : playing ? "Stop" : "Listen to Alert";

  return (
    <span className={styles.wrap}>
      <button
        className={styles.button}
        type="button"
        disabled={loading}
        title={label}
        onClick={() => (playing ? voice.stop() : voice.play())}
      >
        {label}
      </button>
      {voice.status === "error" && voice.error ? (
        <span className={styles.error}>
          {voice.error}{" "}
          <button className={styles.retry} type="button" onClick={() => voice.play()}>
            Retry
          </button>
        </span>
      ) : null}
    </span>
  );
}
