import type { DataListener, DataSource } from "./DataSource";
import type { Alert, Event, Ready, State, Step } from "../types/contract";
import { EXPECTED_MS, STEPS } from "../types/contract";
import { DEFAULT_THRESHOLD } from "../state/streamReducer";
import type { ConnectionStatus } from "../state/streamReducer";

const MACHINE_ID = "assembly_01";
const THRESHOLD = DEFAULT_THRESHOLD;
const BASELINE = 0.12;

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function cloneState(state: State): State {
  return structuredClone(state);
}

export class DemoSource implements DataSource {
  status: ConnectionStatus = "demo";
  private listeners = new Set<DataListener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private cycleId = 1;
  private reviewForCycle = new Set<number>();
  private delayedCycles = new Set<number>();
  private state: State;
  private readonly authDisabled: boolean;
  private readonly authName: string | null;

  constructor(options?: { authDisabled?: boolean; authName?: string | null }) {
    this.authDisabled = options?.authDisabled ?? true;
    this.authName = options?.authName ?? null;
    this.state = this.initialState();
  }

  subscribe(listener: DataListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    this.stop();
    this.stopped = false;
    this.cycleId = 1;
    this.reviewForCycle.clear();
    this.delayedCycles.clear();
    this.state = this.initialState();
    this.emitStatus("demo");
    this.emitReady();
    this.emitState();
    this.scheduleCycle(this.cycleId);
    this.interval = setInterval(() => {
      if (this.stopped) {
        return;
      }
      this.emitActivityLevel();
    }, 500);
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  acknowledge(alertId: string): Promise<Alert> {
    const existing = this.state.alerts.find((item) => item.alert_id === alertId);
    if (!existing) {
      return Promise.reject(new Error("Alert no longer available"));
    }
    const alert: Alert = {
      ...existing,
      acknowledged: true,
      acknowledged_by: "demo-operator",
      acknowledged_at: nowIso(),
    };
    this.state.alerts = [alert, ...this.state.alerts.filter((item) => item.alert_id !== alertId)];
    this.emitAlert(alert);
    const event: Event = {
      event_id: id(),
      timestamp: nowIso(),
      source: "system",
      event_type: "ALERT_ACKNOWLEDGED",
      machine_id: MACHINE_ID,
      payload: { alert_id: alertId, acknowledged_by: "demo-operator" },
    };
    this.pushEvent(event);
    this.emitState();
    return Promise.resolve(alert);
  }

  explain(_alertId: string): Promise<{ explanation: string }> | null {
    return null;
  }

  fetchVoice(_alertId: string): Promise<Blob> | null {
    return null;
  }

  private initialState(): State {
    return {
      server: {
        auth_mode: this.authDisabled ? "disabled" : "auth0",
        persistence: "memory",
        voice_enabled: false,
        explain_enabled: false,
      },
      company: { id: "demo-co", name: "Demo Manufacturing" },
      machine: {
        machine_id: MACHINE_ID,
        status: "IDLE",
        current_step: null,
        cycle_id: 0,
        step_started_at: null,
        simulated: true,
      },
      sensor: {
        activity_score: BASELINE,
        active: false,
        method: "simulated",
        last_update_at: nowIso(),
        connected: true,
      },
      alerts: [],
      recent_events: [],
    };
  }

  private emitReady(): void {
    const ready: Ready = {
      auth_mode: this.authDisabled ? "disabled" : "auth0",
      user: {
        id: this.authDisabled ? "demo-operator" : "auth0-user",
        name: this.authDisabled ? "Demo Operator" : (this.authName ?? "Operator"),
      },
      company: { id: "demo-co", name: "Demo Manufacturing" },
    };
    for (const listener of this.listeners) {
      listener.onReady(ready);
    }
  }

  private emitStatus(status: ConnectionStatus, detail?: string | null): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener.onStatus(status, detail);
    }
  }

  private emitState(): void {
    const snapshot = cloneState(this.state);
    for (const listener of this.listeners) {
      listener.onState(snapshot);
    }
  }

  private emitAlert(alert: Alert): void {
    for (const listener of this.listeners) {
      listener.onAlert(alert);
    }
  }

  private pushEvent(event: Event): void {
    this.state.recent_events = [event, ...this.state.recent_events].slice(0, 50);
    for (const listener of this.listeners) {
      listener.onEvent(event);
    }
  }

  private later(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      if (!this.stopped) {
        fn();
      }
    }, ms);
    this.timers.push(timer);
  }

  private scheduleCycle(cycleId: number): void {
    if (cycleId % 3 === 0) {
      this.delayedCycles.add(cycleId);
    }
    let offset = 400;
    for (const step of STEPS) {
      const expected = EXPECTED_MS[step];
      const duration =
        step === "ASSEMBLE" && this.delayedCycles.has(cycleId) ? Math.round(expected * 1.6) : expected;
      const startAt = offset;
      this.later(startAt, () => this.startStep(cycleId, step));
      if (step === "ASSEMBLE") {
        this.later(startAt + 500, () => this.detectActivity(cycleId));
        this.later(startAt + duration - 400, () => this.clearActivity());
      }
      this.later(startAt + duration, () => this.completeStep(cycleId, step, duration, expected));
      offset += duration;
    }
    this.later(offset + 700, () => {
      this.state.machine.status = "IDLE";
      this.state.machine.current_step = null;
      this.state.machine.step_started_at = null;
      this.emitState();
      this.cycleId = cycleId + 1;
      this.scheduleCycle(this.cycleId);
    });
  }

  private startStep(cycleId: number, step: Step): void {
    const timestamp = nowIso();
    this.state.machine.status = "RUNNING";
    this.state.machine.current_step = step;
    this.state.machine.cycle_id = cycleId;
    this.state.machine.step_started_at = timestamp;
    const event: Event = {
      event_id: id(),
      timestamp,
      source: "machine",
      event_type: "STEP_STARTED",
      machine_id: MACHINE_ID,
      payload: { step, cycle_id: cycleId },
    };
    this.pushEvent(event);
    this.emitState();
  }

  private completeStep(cycleId: number, step: Step, durationMs: number, expectedMs: number): void {
    const timestamp = nowIso();
    const event: Event = {
      event_id: id(),
      timestamp,
      source: "machine",
      event_type: "STEP_COMPLETED",
      machine_id: MACHINE_ID,
      payload: { step, cycle_id: cycleId, duration_ms: durationMs, expected_ms: expectedMs },
    };
    this.pushEvent(event);
    if (durationMs > expectedMs * 1.5) {
      this.createAlert({
        rule: "STEP_DELAY",
        severity: "warning",
        message: `${step} duration exceeded 1.5× expected. Operator review recommended.`,
        cycleId,
        related: [event.event_id],
      });
    }
    this.emitState();
  }

  private emitActivityLevel(): void {
    const assemble = this.state.machine.current_step === "ASSEMBLE";
    const score = assemble
      ? Math.min(0.98, THRESHOLD + 0.12 + Math.random() * 0.2)
      : BASELINE + Math.random() * 0.08;
    const timestamp = nowIso();
    this.state.sensor.activity_score = score;
    this.state.sensor.active = score >= THRESHOLD;
    this.state.sensor.last_update_at = timestamp;
    this.state.sensor.connected = true;
    this.state.sensor.method = "simulated";
    const event: Event = {
      event_id: id(),
      timestamp,
      source: "sensor",
      event_type: "ACTIVITY_LEVEL",
      machine_id: MACHINE_ID,
      payload: { activity_score: score, method: "simulated", baseline: BASELINE },
    };
    this.pushEvent(event);
  }

  private detectActivity(cycleId: number): void {
    const score = THRESHOLD + 0.2;
    const timestamp = nowIso();
    this.state.sensor.activity_score = score;
    this.state.sensor.active = true;
    this.state.sensor.last_update_at = timestamp;
    const detected: Event = {
      event_id: id(),
      timestamp,
      source: "sensor",
      event_type: "ACTIVITY_DETECTED",
      machine_id: MACHINE_ID,
      payload: { activity_score: score, threshold: THRESHOLD, method: "simulated" },
    };
    this.pushEvent(detected);
    if (!this.reviewForCycle.has(cycleId) && this.state.machine.current_step === "ASSEMBLE") {
      this.reviewForCycle.add(cycleId);
      this.createAlert({
        rule: "ACTIVITY_REVIEW",
        severity: "warning",
        message: "Activity detected near the cell during ASSEMBLE. Operator review recommended.",
        cycleId,
        related: [detected.event_id],
      });
    }
    this.emitState();
  }

  private clearActivity(): void {
    const score = BASELINE;
    const timestamp = nowIso();
    this.state.sensor.activity_score = score;
    this.state.sensor.active = false;
    this.state.sensor.last_update_at = timestamp;
    const event: Event = {
      event_id: id(),
      timestamp,
      source: "sensor",
      event_type: "ACTIVITY_CLEARED",
      machine_id: MACHINE_ID,
      payload: { activity_score: score, method: "simulated" },
    };
    this.pushEvent(event);
    this.emitState();
  }

  private createAlert(input: {
    rule: Alert["rule"];
    severity: Alert["severity"];
    message: string;
    cycleId: number;
    related: string[];
  }): void {
    const alert: Alert = {
      alert_id: id(),
      rule: input.rule,
      severity: input.severity,
      message: input.message,
      created_at: nowIso(),
      cycle_id: input.cycleId,
      acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      related_event_ids: input.related,
    };
    this.state.alerts = [alert, ...this.state.alerts];
    const created: Event = {
      event_id: id(),
      timestamp: alert.created_at,
      source: "system",
      event_type: "ALERT_CREATED",
      machine_id: MACHINE_ID,
      payload: {
        alert_id: alert.alert_id,
        rule: alert.rule,
        severity: alert.severity,
        message: alert.message,
        related_event_ids: alert.related_event_ids,
      },
    };
    this.pushEvent(created);
    this.emitAlert(alert);
  }
}
