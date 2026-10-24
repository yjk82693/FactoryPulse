import type { Alert, Event, Ready, State } from "../types/contract";

export function makeReady(overrides: Partial<Ready> = {}): Ready {
  return {
    auth_mode: "disabled",
    user: { id: "dev-user", name: "Dev User" },
    company: { id: "demo-co", name: "Demo Manufacturing" },
    ...overrides,
  };
}

export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    alert_id: "11111111-1111-4111-8111-111111111111",
    rule: "ACTIVITY_REVIEW",
    severity: "warning",
    message: "Activity detected near the cell during ASSEMBLE. Operator review recommended.",
    created_at: "2026-10-24T18:30:00.000Z",
    cycle_id: 1,
    acknowledged: false,
    acknowledged_by: null,
    acknowledged_at: null,
    related_event_ids: [],
    ...overrides,
  };
}

export function makeState(overrides: Partial<State> = {}): State {
  return {
    server: {
      auth_mode: "disabled",
      persistence: "memory",
      voice_enabled: false,
      explain_enabled: false,
    },
    company: { id: "demo-co", name: "Demo Manufacturing" },
    machine: {
      machine_id: "assembly_01",
      status: "RUNNING",
      current_step: "ASSEMBLE",
      cycle_id: 12,
      step_started_at: "2026-10-24T18:30:00.000Z",
      simulated: true,
    },
    sensor: {
      activity_score: 0.42,
      active: true,
      method: "simulated",
      last_update_at: "2026-10-24T18:30:00.000Z",
      connected: true,
    },
    alerts: [],
    recent_events: [],
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: "22222222-2222-4222-8222-222222222222",
    timestamp: "2026-10-24T18:30:00.000Z",
    source: "machine",
    event_type: "STEP_STARTED",
    machine_id: "assembly_01",
    payload: { step: "PICK", cycle_id: 1 },
    ...overrides,
  };
}
