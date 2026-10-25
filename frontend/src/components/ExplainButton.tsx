import { useState } from "react";
import { ApiClientError } from "../services/api";
import { buildExplainBriefing } from "../lib/explainBriefing";
import type { Alert, Event, Step } from "../types/contract";
import styles from "./ExplainButton.module.css";

interface Props {
  alert: Alert;
  demoMode: boolean;
  explainEnabled: boolean;
  fetchExplain: ((alertId: string) => Promise<{ explanation: string }>) | null;
  machineId?: string | null;
  currentStep?: Step | null;
  events?: Event[];
}

function mapExplainError(error: unknown): { message: string; disable: boolean } {
  if (error instanceof ApiClientError) {
    if (error.status === 501 || (error.status === 404 && error.code !== "alert_not_found")) {
      return { message: "Alert explanations are not configured on the server.", disable: true };
    }
    if (error.status === 404) {
      return { message: "Alert no longer available.", disable: false };
    }
    if (error.status === 502 || error.status === 504) {
      return { message: "Explanation service unavailable, try again.", disable: false };
    }
  }
  return { message: "Explanation service unavailable, try again.", disable: false };
}

export function ExplainButton({
  alert,
  demoMode,
  explainEnabled,
  fetchExplain,
  machineId,
  currentStep,
  events = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  if (demoMode || !explainEnabled) {
    return null;
  }

  const factsOnly = buildExplainBriefing(alert, text, { machineId, currentStep, events });

  async function load(): Promise<void> {
    if (!fetchExplain || disabled || loading) {
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchExplain(alert.alert_id);
      setText(result.explanation);
    } catch (caught) {
      const mapped = mapExplainError(caught);
      setError(mapped.message);
      setDisabled(mapped.disable);
    } finally {
      setLoading(false);
    }
  }

  if (disabled) {
    return (
      <button className={styles.button} type="button" disabled title="Alert explanations are not configured on the server.">
        Explain
      </button>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        className={styles.button}
        type="button"
        disabled={loading || !fetchExplain}
        onClick={() => {
          if (open && text) {
            setOpen(false);
            return;
          }
          void load();
        }}
      >
        {loading ? "Explaining…" : open ? "Hide explanation" : "Explain"}
      </button>
      {open ? (
        <div className={styles.panel}>
          <p className={styles.disclaimer}>{factsOnly.disclaimer}</p>
          <p className={styles.note}>
            Voice briefings are generated on the server from stored alert fields. This panel never sends Gemini text
            or API keys to the browser TTS or ElevenLabs.
          </p>
          <div className={styles.heading}>Observed facts</div>
          <ul>
            {factsOnly.observedFacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className={styles.heading}>Possible interpretations</div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <ul>
            {factsOnly.interpretations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className={styles.heading}>Recommended checks</div>
          <ul>
            {factsOnly.recommendedChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
