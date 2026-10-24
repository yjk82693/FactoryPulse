import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSource } from "./LiveSource";
import { FakeSocket } from "../test/fakeSocket";
import { makeAlert, makeEvent, makeReady, makeState } from "../test/fixtures";
import { AUTH_MISMATCH_MESSAGE, NO_COMPANY_MESSAGE } from "../services/ws";
import type { ConnectionStatus } from "../state/streamReducer";
import type { Alert, Event, Ready, State } from "../types/contract";

const FakeSocketCtor = FakeSocket as unknown as new (
  url: string | URL,
) => Pick<WebSocket, "addEventListener" | "send" | "close">;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function listen(source: LiveSource) {
  const states: State[] = [];
  const events: Event[] = [];
  const alerts: Alert[] = [];
  const readies: Ready[] = [];
  const statuses: Array<{ status: ConnectionStatus; detail?: string | null }> = [];
  source.subscribe({
    onReady: (ready) => readies.push(ready),
    onState: (state) => states.push(state),
    onEvent: (event) => events.push(event),
    onAlert: (alert) => alerts.push(alert),
    onStatus: (status, detail) => statuses.push({ status, detail }),
  });
  return { states, events, alerts, readies, statuses };
}

describe("LiveSource", () => {
  it("loads REST state then applies WebSocket ready, state, and deltas", async () => {
    const initial = makeState({ machine: { ...makeState().machine, cycle_id: 1 } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/state")) {
          return jsonResponse(initial);
        }
        return jsonResponse({ detail: "missing", code: "not_found" }, 404);
      }),
    );
    const source = new LiveSource({
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      authDisabled: true,
      webSocketCtor: FakeSocketCtor,
    });
    const received = listen(source);
    source.start();
    await vi.waitFor(() => {
      expect(received.states[0]?.machine.cycle_id).toBe(1);
    });
    const fake = FakeSocket.instances[0];
    fake?.open();
    fake?.push(JSON.stringify({ type: "state", data: makeState({ machine: { ...makeState().machine, cycle_id: 99 } }) }));
    expect(received.states.map((item) => item.machine.cycle_id)).toEqual([1]);
    fake?.push(JSON.stringify({ type: "ready", data: makeReady() }));
    fake?.push(JSON.stringify({ type: "state", data: makeState({ machine: { ...makeState().machine, cycle_id: 2 } }) }));
    fake?.push(JSON.stringify({ type: "event", data: makeEvent({ event_id: "live-1" }) }));
    fake?.push(JSON.stringify({ type: "alert", data: makeAlert() }));
    expect(received.readies).toHaveLength(1);
    expect(received.states.at(-1)?.machine.cycle_id).toBe(2);
    expect(received.events).toHaveLength(1);
    expect(received.alerts).toHaveLength(1);
    source.stop();
  });

  it("never calls DemoSource when the backend is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const source = new LiveSource({
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      authDisabled: true,
      webSocketCtor: FakeSocketCtor,
    });
    const received = listen(source);
    source.start();
    await vi.waitFor(() => {
      expect(received.statuses.some((item) => item.status === "offline")).toBe(true);
    });
    expect(received.states).toHaveLength(0);
    source.stop();
  });

  it("maps 401 and 403 from GET /api/state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    const forbidden = new LiveSource({
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      authDisabled: true,
      webSocketCtor: FakeSocketCtor,
    });
    const received = listen(forbidden);
    forbidden.start();
    await vi.waitFor(() => {
      expect(received.statuses.some((item) => item.detail === NO_COMPANY_MESSAGE)).toBe(true);
    });
    forbidden.stop();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const unauth = new LiveSource({
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      authDisabled: true,
      webSocketCtor: FakeSocketCtor,
    });
    const second = listen(unauth);
    unauth.start();
    await vi.waitFor(() => {
      expect(second.statuses.some((item) => item.detail === AUTH_MISMATCH_MESSAGE)).toBe(true);
    });
    unauth.stop();
  });
});
