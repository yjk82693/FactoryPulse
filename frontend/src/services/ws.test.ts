import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_MISMATCH_MESSAGE,
  backoffMs,
  FactorySocket,
  NO_COMPANY_MESSAGE,
  shouldApplyMessage,
} from "./ws";
import type { WsMessage } from "../types/contract";

class FakeSocket {
  static instances: FakeSocket[] = [];
  url: string;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: { data?: string; code?: number }) => void>> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(url: string | URL) {
    this.url = String(url);
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: { data?: string; code?: number }) => void): void {
    this.listeners[type]?.push(fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    for (const fn of this.listeners.close ?? []) {
      fn({ code });
    }
  }

  open(): void {
    for (const fn of this.listeners.open ?? []) {
      fn({});
    }
  }

  push(data: string): void {
    for (const fn of this.listeners.message ?? []) {
      fn({ data });
    }
  }
}

function connect(authDisabled: boolean, getToken?: () => Promise<string | null>) {
  const messages: WsMessage[] = [];
  const statuses: Array<{ status: string; detail?: string | null }> = [];
  const socket = new FactorySocket({
    url: "ws://localhost:8000/ws",
    authDisabled,
    getToken,
    webSocketCtor: FakeSocket as unknown as new (url: string | URL) => Pick<
      WebSocket,
      "addEventListener" | "send" | "close"
    >,
    random: () => 0,
    onMessage: (message) => messages.push(message),
    onStatus: (status, detail) => statuses.push({ status, detail }),
  });
  socket.start();
  const fake = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (!fake) {
    throw new Error("expected socket");
  }
  return { socket, fake, messages, statuses };
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
});

describe("ws protocol", () => {
  it("ignores state, event, and alert before ready", () => {
    const { fake, messages } = connect(true);
    fake.open();
    fake.push(JSON.stringify({ type: "state", data: { machine: { status: "RUNNING" } } }));
    fake.push(JSON.stringify({ type: "event", data: { event_id: "x" } }));
    fake.push(JSON.stringify({ type: "alert", data: { alert_id: "y" } }));
    expect(messages).toEqual([]);
    fake.push(
      JSON.stringify({
        type: "ready",
        data: {
          auth_mode: "disabled",
          user: { id: "dev-user", name: "Dev User" },
          company: { id: "demo-co", name: "Demo Manufacturing" },
        },
      }),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("ready");
  });

  it("sends an auth message only when auth is enabled", async () => {
    const disabled = connect(true);
    disabled.fake.open();
    await Promise.resolve();
    expect(disabled.fake.sent).toEqual([]);

    const enabled = connect(false, async () => "token-123");
    enabled.fake.open();
    await Promise.resolve();
    expect(enabled.fake.sent).toEqual([JSON.stringify({ type: "auth", token: "token-123" })]);
  });

  it("uses exponential backoff from 1s to 15s plus jitter", () => {
    expect(backoffMs(0, () => 0)).toBe(1000);
    expect(backoffMs(1, () => 0)).toBe(2000);
    expect(backoffMs(2, () => 0)).toBe(4000);
    expect(backoffMs(10, () => 0)).toBe(15000);
    expect(backoffMs(0, () => 0.5)).toBe(1000 + 200);
  });

  it("schedules reconnect using backoff after an unexpected close", () => {
    vi.useFakeTimers();
    const { fake } = connect(true);
    fake.open();
    fake.close(1006);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("stops on 4403", () => {
    const { fake, statuses, socket } = connect(true);
    fake.open();
    fake.close(4403);
    expect(statuses.some((item) => item.detail === NO_COMPANY_MESSAGE)).toBe(true);
    socket.stop();
  });

  it("maps 4401 to the auth mismatch message", () => {
    const { fake, statuses } = connect(true);
    fake.open();
    fake.close(4401);
    expect(statuses.some((item) => item.detail === AUTH_MISMATCH_MESSAGE && item.status === "error")).toBe(
      true,
    );
  });

  it("does not apply messages before ready according to the filter helper", () => {
    expect(shouldApplyMessage(false, { type: "ping" })).toBe(false);
    expect(shouldApplyMessage(false, { type: "ready", data: {
      auth_mode: "disabled",
      user: { id: "a", name: "A" },
      company: { id: "demo-co", name: "Demo Manufacturing" },
    } })).toBe(true);
  });
});
