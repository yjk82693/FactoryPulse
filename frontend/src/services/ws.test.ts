import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_MISMATCH_MESSAGE,
  backoffMs,
  FactorySocket,
  NO_COMPANY_MESSAGE,
  shouldApplyMessage,
} from "./ws";
import type { WsMessage } from "../types/contract";
import { FakeSocket } from "../test/fakeSocket";

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

  it("ignores malformed payloads", () => {
    const { fake, messages } = connect(true);
    fake.open();
    fake.push("not-json");
    fake.push(JSON.stringify({ type: "mystery" }));
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
    fake.push("{");
    expect(messages).toHaveLength(1);
  });

  it("treats 45s of silence as a dead connection", () => {
    vi.useFakeTimers();
    const { fake } = connect(true);
    fake.open();
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
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(44_999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("resets silence on ping after ready", () => {
    vi.useFakeTimers();
    const { fake, messages } = connect(true);
    fake.open();
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
    vi.advanceTimersByTime(40_000);
    fake.push(JSON.stringify({ type: "ping" }));
    expect(messages.some((message) => message.type === "ping")).toBe(true);
    vi.advanceTimersByTime(40_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("retries 4401 once when auth is enabled", async () => {
    const getToken = vi.fn(async () => "token-123");
    const { fake } = connect(false, getToken);
    fake.open();
    await Promise.resolve();
    fake.close(4401);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(getToken).toHaveBeenCalled();
  });

  it("does not reconnect after stop", () => {
    vi.useFakeTimers();
    const { fake, socket } = connect(true);
    fake.open();
    socket.stop();
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
