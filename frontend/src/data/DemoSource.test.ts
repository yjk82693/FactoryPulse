import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoSource } from "./DemoSource";
import type { Alert } from "../types/contract";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("DemoSource", () => {
  it("never calls fetch or WebSocket", async () => {
    const fetchSpy = vi.fn();
    const wsSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("WebSocket", wsSpy);

    const source = new DemoSource();
    source.subscribe({
      onReady: () => undefined,
      onState: () => undefined,
      onEvent: () => undefined,
      onAlert: () => undefined,
      onStatus: () => undefined,
    });
    source.start();
    await source.acknowledge("missing").catch(() => undefined);
    source.stop();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
  });

  it("acknowledges locally and emits ALERT_ACKNOWLEDGED without network calls", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const source = new DemoSource();
    const alerts: Alert[] = [];
    const types: string[] = [];
    source.subscribe({
      onReady: () => undefined,
      onState: () => undefined,
      onEvent: (event) => types.push(event.event_type),
      onAlert: (alert) => alerts.push(alert),
      onStatus: () => undefined,
    });
    source.start();
    await vi.advanceTimersByTimeAsync(7000);
    const open = alerts.find((item) => !item.acknowledged);
    expect(open).toBeDefined();
    const result = await source.acknowledge(open!.alert_id);
    expect(result.acknowledged).toBe(true);
    expect(result.acknowledged_by).toBe("demo-operator");
    expect(types).toContain("ALERT_ACKNOWLEDGED");
    expect(fetchSpy).not.toHaveBeenCalled();
    source.stop();
  });
});
