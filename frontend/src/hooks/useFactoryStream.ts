import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { DataSource } from "../data/DataSource";
import { initialStream, streamReducer } from "../state/streamReducer";

export function useFactoryStream(source: DataSource) {
  const [snapshot, dispatch] = useReducer(streamReducer, initialStream);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    const unsubscribe = source.subscribe({
      onReady: (ready) => dispatch({ type: "ready", ready }),
      onState: (state) => dispatch({ type: "state", state }),
      onEvent: (event) => dispatch({ type: "event", event }),
      onAlert: (alert) => dispatch({ type: "alert", alert }),
      onStatus: (status, detail) => dispatch({ type: "status", status, detail }),
    });
    source.start();
    return () => {
      unsubscribe();
      source.stop();
    };
  }, [source]);

  const acknowledge = useCallback(
    async (alertId: string) => {
      const current = snapshotRef.current.state?.alerts.find((item) => item.alert_id === alertId);
      const acknowledgedBy = snapshotRef.current.ready?.user.name ?? "operator";
      const acknowledgedAt = new Date().toISOString();
      if (current && !current.acknowledged) {
        dispatch({
          type: "ack-optimistic",
          alertId,
          acknowledgedBy,
          acknowledgedAt,
        });
      }
      try {
        const updated = await source.acknowledge(alertId);
        dispatch({ type: "alert", alert: updated });
      } catch (error) {
        if (current) {
          dispatch({ type: "ack-rollback", alert: current });
        }
        throw error;
      }
    },
    [source],
  );

  return useMemo(
    () => ({
      ...snapshot,
      acknowledge,
    }),
    [snapshot, acknowledge],
  );
}

export { streamReducer, initialStream };
