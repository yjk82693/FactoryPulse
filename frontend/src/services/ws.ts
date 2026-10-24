import type { WsAuthMessage, WsMessage } from "../types/contract";

export const AUTH_MISMATCH_MESSAGE = "Session expired or auth configuration mismatch";
export const NO_COMPANY_MESSAGE = "No access to this company";
export const SILENCE_MS = 45_000;
export const MIN_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 15_000;

export type SocketStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";

type SocketLike = Pick<WebSocket, "addEventListener" | "send" | "close">;

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(random() * 400);
  return exp + jitter;
}

export function parseWsMessage(raw: string): WsMessage | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }
    if (parsed.type === "ping") {
      return { type: "ping" };
    }
    if (
      parsed.type === "ready" ||
      parsed.type === "state" ||
      parsed.type === "event" ||
      parsed.type === "alert"
    ) {
      return parsed as WsMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function shouldApplyMessage(gotReady: boolean, message: WsMessage): boolean {
  if (message.type === "ready") {
    return true;
  }
  return gotReady;
}

export interface FactorySocketOptions {
  url: string;
  authDisabled: boolean;
  getToken?: () => Promise<string | null>;
  onMessage: (message: WsMessage) => void;
  onStatus: (status: SocketStatus, detail?: string | null) => void;
  webSocketCtor?: new (url: string | URL) => SocketLike;
  random?: () => number;
  silenceMs?: number;
}

export class FactorySocket {
  private readonly options: FactorySocketOptions;
  private socket: SocketLike | null = null;
  private stopped = false;
  private gotReady = false;
  private attempt = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retriedAuthOnce = false;

  constructor(options: FactorySocketOptions) {
    this.options = options;
  }

  start(): void {
    this.stopped = false;
    this.attempt = 0;
    this.retriedAuthOnce = false;
    this.options.onStatus("connecting");
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  private open(): void {
    if (this.stopped) {
      return;
    }
    this.gotReady = false;
    const Ctor = this.options.webSocketCtor ?? WebSocket;
    const socket = new Ctor(this.options.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      void this.onOpen(socket);
    });
    socket.addEventListener("message", (event) => {
      this.onMessage(String(event.data));
    });
    socket.addEventListener("close", (event) => {
      void this.onClose(event.code);
    });
    socket.addEventListener("error", () => {
      // Close handler drives reconnect; keep last known UI state.
    });
  }

  private async onOpen(socket: SocketLike): Promise<void> {
    this.resetSilence();
    if (this.options.authDisabled) {
      return;
    }
    const token = (await this.options.getToken?.()) ?? null;
    if (this.stopped || this.socket !== socket) {
      return;
    }
    if (token) {
      const auth: WsAuthMessage = { type: "auth", token };
      socket.send(JSON.stringify(auth));
    }
  }

  private onMessage(raw: string): void {
    this.resetSilence();
    const message = parseWsMessage(raw);
    if (!message) {
      return;
    }
    if (!shouldApplyMessage(this.gotReady, message)) {
      return;
    }
    if (message.type === "ready") {
      this.gotReady = true;
      this.attempt = 0;
      this.options.onStatus("live");
    }
    this.options.onMessage(message);
  }

  private async onClose(code: number): Promise<void> {
    this.clearSilence();
    this.socket = null;
    this.gotReady = false;
    if (this.stopped) {
      return;
    }
    if (code === 4403) {
      this.options.onStatus("error", NO_COMPANY_MESSAGE);
      this.stopped = true;
      return;
    }
    if (code === 4401) {
      this.options.onStatus("reconnecting", AUTH_MISMATCH_MESSAGE);
      if (!this.options.authDisabled && !this.retriedAuthOnce) {
        this.retriedAuthOnce = true;
        await this.options.getToken?.();
        if (!this.stopped) {
          this.open();
        }
        return;
      }
      this.options.onStatus("error", AUTH_MISMATCH_MESSAGE);
      this.stopped = true;
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = backoffMs(this.attempt, this.options.random);
    this.attempt += 1;
    this.options.onStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped) {
        this.open();
      }
    }, delay);
  }

  private resetSilence(): void {
    this.clearSilence();
    const silenceMs = this.options.silenceMs ?? SILENCE_MS;
    this.silenceTimer = setTimeout(() => {
      this.socket?.close();
    }, silenceMs);
  }

  private clearSilence(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearSilence();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
