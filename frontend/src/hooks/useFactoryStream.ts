import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { DataSource } from "../data/DataSource";
import { initialStream, streamReducer } from "../state/streamReducer";

export function useFactoryStream(source: DataSource) {
  const [snapshot, dispatch] = useReducer(streamReducer, initialStream);

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
      await source.acknowledge(alertId);
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
