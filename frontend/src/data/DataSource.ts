import type { Alert, Event, Ready, State } from "../types/contract";
import type { ConnectionStatus } from "../state/streamReducer";

export interface DataListener {
  onReady: (ready: Ready) => void;
  onState: (state: State) => void;
  onEvent: (event: Event) => void;
  onAlert: (alert: Alert) => void;
  onStatus: (status: ConnectionStatus, detail?: string | null) => void;
}

export interface DataSource {
  start(): void;
  stop(): void;
  subscribe(listener: DataListener): () => void;
  acknowledge(alertId: string): Promise<Alert>;
  explain(alertId: string): Promise<{ explanation: string }> | null;
  fetchVoice(alertId: string): Promise<Blob> | null;
  readonly status: ConnectionStatus;
}
