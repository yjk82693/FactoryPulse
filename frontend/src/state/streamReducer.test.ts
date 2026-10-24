import { describe, expect, it } from "vitest";
import { initialStream, MAX_EVENTS, SAMPLE_WINDOW_MS, streamReducer } from "./streamReducer";
import { makeAlert, makeEvent, makeReady, makeState } from "../test/fixtures";

describe("streamReducer", () => {
  it("applies ready", () => {
    const ready = makeReady();
    const next = streamReducer(initialStream, { type: "ready", ready });
    expect(next.ready).toEqual(ready);
  });

  it("applies state and seeds recent events newest first", () => {
    const older = makeEvent({ event_id: "a", timestamp: "2026-10-24T18:00:00.000Z" });
    const newer = makeEvent({ event_id: "b", timestamp: "2026-10-24T19:00:00.000Z" });
    const next = streamReducer(initialStream, {
      type: "state",
      state: makeState({ recent_events: [older, newer] }),
    });
    expect(next.state?.machine.cycle_id).toBe(12);
    expect(next.events.map((event) => event.event_id)).toEqual(["b", "a"]);
  });

  it("prepends events and caps the buffer", () => {
    let snap = streamReducer(initialStream, { type: "state", state: makeState() });
    for (let i = 0; i < MAX_EVENTS + 5; i += 1) {
      snap = streamReducer(snap, {
        type: "event",
        event: makeEvent({
          event_id: `e-${i}`,
          timestamp: `2026-10-24T18:30:${String(i % 60).padStart(2, "0")}.000Z`,
        }),
      });
    }
    expect(snap.events).toHaveLength(MAX_EVENTS);
    expect(snap.events[0]?.event_id).toBe(`e-${MAX_EVENTS + 4}`);
  });

  it("records activity samples and drops values older than 120s", () => {
    let snap = streamReducer(initialStream, { type: "state", state: makeState() });
    const now = 1_000_000;
    snap = streamReducer(snap, {
      type: "event",
      now: now - SAMPLE_WINDOW_MS - 1000,
      event: makeEvent({
        event_id: "old",
        timestamp: new Date(now - SAMPLE_WINDOW_MS - 1000).toISOString(),
        source: "sensor",
        event_type: "ACTIVITY_LEVEL",
        payload: { activity_score: 0.2, method: "simulated", baseline: 0.1 },
      }),
    });
    snap = streamReducer(snap, {
      type: "event",
      now,
      event: makeEvent({
        event_id: "new",
        timestamp: new Date(now).toISOString(),
        source: "sensor",
        event_type: "ACTIVITY_LEVEL",
        payload: { activity_score: 0.8, method: "simulated", baseline: 0.1 },
      }),
    });
    expect(snap.samples).toHaveLength(1);
    expect(snap.samples[0]?.score).toBe(0.8);
  });

  it("upserts alerts", () => {
    let snap = streamReducer(initialStream, { type: "state", state: makeState() });
    const alert = makeAlert();
    snap = streamReducer(snap, { type: "alert", alert });
    snap = streamReducer(snap, {
      type: "alert",
      alert: { ...alert, acknowledged: true, acknowledged_by: "demo-operator" },
    });
    expect(snap.state?.alerts).toHaveLength(1);
    expect(snap.state?.alerts[0]?.acknowledged).toBe(true);
  });

  it("ignores duplicate event ids", () => {
    let snap = streamReducer(initialStream, { type: "state", state: makeState() });
    const event = makeEvent({ event_id: "dup" });
    snap = streamReducer(snap, { type: "event", event });
    const again = streamReducer(snap, {
      type: "event",
      event: { ...event, payload: { step: "MOVE", cycle_id: 9 } },
    });
    expect(again.events).toHaveLength(1);
    expect(again.state?.machine.current_step).toBe("PICK");
  });

  it("keeps last known state while reconnecting", () => {
    let snap = streamReducer(initialStream, { type: "state", state: makeState() });
    snap = streamReducer(snap, { type: "status", status: "reconnecting", detail: "retrying" });
    expect(snap.state?.machine.cycle_id).toBe(12);
    expect(snap.status).toBe("reconnecting");
  });

  it("acknowledges optimistically and rolls back", () => {
    const alert = makeAlert();
    let snap = streamReducer(initialStream, { type: "state", state: makeState({ alerts: [alert] }) });
    snap = streamReducer(snap, {
      type: "ack-optimistic",
      alertId: alert.alert_id,
      acknowledgedBy: "dev-user",
      acknowledgedAt: "2026-10-24T18:31:00.000Z",
    });
    expect(snap.state?.alerts[0]?.acknowledged).toBe(true);
    snap = streamReducer(snap, { type: "ack-rollback", alert });
    expect(snap.state?.alerts[0]?.acknowledged).toBe(false);
  });
});
