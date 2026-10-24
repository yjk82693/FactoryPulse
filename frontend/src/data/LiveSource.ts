import type { DataListener, DataSource } from "./DataSource";
import type { Alert, MeResponse, State } from "../types/contract";
import type { ConnectionStatus } from "../state/streamReducer";
import { ApiClientError, createApiClient, type ApiClient } from "../services/api";
import { AUTH_MISMATCH_MESSAGE, FactorySocket, NO_COMPANY_MESSAGE } from "../services/ws";

export interface LiveSourceOptions {
  apiUrl: string;
  wsUrl: string;
  authDisabled: boolean;
  getToken?: () => Promise<string | null>;
  webSocketCtor?: new (url: string | URL) => Pick<WebSocket, "addEventListener" | "send" | "close">;
}

export class LiveSource implements DataSource {
  status: ConnectionStatus = "connecting";
  private readonly listeners = new Set<DataListener>();
  private readonly api: ApiClient;
  private readonly options: LiveSourceOptions;
  private socket: FactorySocket | null = null;

  constructor(options: LiveSourceOptions) {
    this.options = options;
    this.api = createApiClient({
      baseUrl: options.apiUrl,
      authDisabled: options.authDisabled,
      getToken: options.getToken,
    });
  }

  subscribe(listener: DataListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    this.stop();
    this.emitStatus("connecting");
    void this.bootstrap();
  }

  stop(): void {
    this.socket?.stop();
    this.socket = null;
  }

  fetchMe(): Promise<MeResponse> {
    return this.api.requestJson<MeResponse>("/api/me");
  }

  acknowledge(alertId: string): Promise<Alert> {
    return this.api.requestJson<Alert>(`/api/alerts/${alertId}/ack`, { method: "POST" });
  }

  explain(alertId: string): Promise<{ explanation: string }> {
    return this.api.requestJson<{ explanation: string }>(`/api/alerts/${alertId}/explain`, {
      method: "POST",
    });
  }

  fetchVoice(alertId: string): Promise<Blob> {
    return this.api.requestBlob(`/api/alerts/${alertId}/voice`, { method: "POST" });
  }

  private async bootstrap(): Promise<void> {
    try {
      const state = await this.api.requestJson<State>("/api/state");
      this.emitState(state);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        this.emitStatus("error", AUTH_MISMATCH_MESSAGE);
      } else if (error instanceof ApiClientError && error.status === 403) {
        this.emitStatus("error", NO_COMPANY_MESSAGE);
      } else if (error instanceof ApiClientError && error.status === 0) {
        this.emitStatus("offline", error.detail);
      } else {
        this.emitStatus("reconnecting", "Unable to load machine state");
      }
    }
    this.connectSocket();
  }

  private connectSocket(): void {
    this.socket = new FactorySocket({
      url: this.options.wsUrl,
      authDisabled: this.options.authDisabled,
      getToken: this.options.getToken,
      webSocketCtor: this.options.webSocketCtor,
      onStatus: (status, detail) => {
        if (
          status === "connecting" &&
          (this.status === "reconnecting" || this.status === "offline" || this.status === "error")
        ) {
          return;
        }
        this.emitStatus(status, detail);
      },
      onMessage: (message) => {
        if (message.type === "ready") {
          for (const listener of this.listeners) {
            listener.onReady(message.data);
          }
          return;
        }
        if (message.type === "state") {
          this.emitState(message.data);
          return;
        }
        if (message.type === "event") {
          for (const listener of this.listeners) {
            listener.onEvent(message.data);
          }
          return;
        }
        if (message.type === "alert") {
          for (const listener of this.listeners) {
            listener.onAlert(message.data);
          }
        }
      },
    });
    this.socket.start();
  }

  private emitStatus(status: ConnectionStatus, detail?: string | null): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener.onStatus(status, detail);
    }
  }

  private emitState(state: State): void {
    for (const listener of this.listeners) {
      listener.onState(state);
    }
  }
}
