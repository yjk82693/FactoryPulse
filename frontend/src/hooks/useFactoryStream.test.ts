import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFactoryStream } from "./useFactoryStream";
import type { DataListener, DataSource } from "../data/DataSource";
import { makeAlert, makeReady, makeState } from "../test/fixtures";
import type { Alert } from "../types/contract";
import type { ConnectionStatus } from "../state/streamReducer";

class MockSource implements DataSource {
  status: ConnectionStatus = "live";
  listener: DataListener | null = null;
  ack = vi.fn<(alertId: string) => Promise<Alert>>();

  subscribe(listener: DataListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  start(): void {
    this.listener?.onReady(makeReady());
    this.listener?.onState(makeState({ alerts: [makeAlert()] }));
    this.listener?.onStatus("live");
  }

  stop(): void {
    /* noop */
  }

  acknowledge(alertId: string): Promise<Alert> {
    return this.ack(alertId);
  }

  explain(): null {
    return null;
  }

  fetchVoice(): null {
    return null;
  }
}

describe("useFactoryStream acknowledge", () => {
  it("rolls back an optimistic ack when Live Mode POST fails", async () => {
    const source = new MockSource();
    source.ack.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useFactoryStream(source));
    expect(result.current.state?.alerts[0]?.acknowledged).toBe(false);
    await act(async () => {
      await expect(result.current.acknowledge("11111111-1111-4111-8111-111111111111")).rejects.toThrow(
        "nope",
      );
    });
    expect(result.current.state?.alerts[0]?.acknowledged).toBe(false);
  });

  it("keeps the optimistic ack when Live Mode POST succeeds", async () => {
    const source = new MockSource();
    const updated = {
      ...makeAlert(),
      acknowledged: true,
      acknowledged_by: "dev-user",
      acknowledged_at: "2026-10-24T18:31:00.000Z",
    };
    source.ack.mockResolvedValue(updated);
    const { result } = renderHook(() => useFactoryStream(source));
    await act(async () => {
      await result.current.acknowledge(updated.alert_id);
    });
    expect(result.current.state?.alerts[0]?.acknowledged).toBe(true);
    expect(source.ack).toHaveBeenCalledWith(updated.alert_id);
  });
});
