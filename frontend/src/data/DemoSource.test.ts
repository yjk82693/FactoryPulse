import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoSource } from "./DemoSource";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
});
