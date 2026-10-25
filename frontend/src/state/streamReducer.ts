import type { Alert, Event, Ready, State } from "../types/contract";

export type ConnectionStatus =
  | "demo"
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "error";

export const MAX_EVENTS = 200;
// Ten level readings/second plus transition events across the two-minute window.
export const MAX_SAMPLES = 1440;
export const SAMPLE_WINDOW_MS = 120_000;
export const DEFAULT_THRESHOLD = 0.55;

export interface ActivitySample {
  t: number;
  score: number;
  threshold: number | null;
  active: boolean;
}

export interface StreamSnapshot {
  status: ConnectionStatus;
  statusDetail: string | null;
  ready: Ready | null;
  state: State | null;
  events: Event[];
  samples: ActivitySample[];
}

export type StreamAction =
  | { type: "status"; status: ConnectionStatus; detail?: string | null }
  | { type: "ready"; ready: Ready }
  | { type: "state"; state: State }
  | { type: "event"; event: Event; now?: number }
  | { type: "alert"; alert: Alert }
  | { type: "ack-optimistic"; alertId: string; acknowledgedBy: string; acknowledgedAt: string }
  | { type: "ack-rollback"; alert: Alert };

export const initialStream: StreamSnapshot = {
  status: "connecting",
  statusDetail: null,
  ready: null,
  state: null,
  events: [],
  samples: [],
};

function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const map = new Map<string, Event>();
  for (const event of [...incoming].reverse()) {
    map.set(event.event_id, event);
  }
  for (const event of existing) {
    if (!map.has(event.event_id)) {
      map.set(event.event_id, event);
    }
  }
  return [...map.values()]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .slice(0, MAX_EVENTS);
}

function upsertAlert(alerts: Alert[], alert: Alert): Alert[] {
  const index = alerts.findIndex((item) => item.alert_id === alert.alert_id);
  if (index === -1) {
    return [alert, ...alerts];
  }
  const next = alerts.slice();
  next[index] = alert;
  return next;
}

function sortAlerts(alerts: Alert[]): Alert[] {
  const open = alerts.filter((item) => !item.acknowledged);
  const acknowledged = alerts.filter((item) => item.acknowledged).slice(0, 20);
  return [...open, ...acknowledged];
}

function lastThreshold(samples: ActivitySample[]): number | null {
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (sample) {
      return sample.threshold;
    }
  }
  return null;
}

function asRecord(payload: Event["payload"]): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}

function applyEventToState(state: State, event: Event): State {
  const payload = asRecord(event.payload);
  const next: State = {
    ...state,
    machine: { ...state.machine },
    sensor: { ...state.sensor },
    alerts: state.alerts,
    recent_events: [event, ...state.recent_events.filter((item) => item.event_id !== event.event_id)].slice(
      0,
      50,
    ),
  };

  switch (event.event_type) {
    case "STEP_STARTED":
      next.machine.status = "RUNNING";
      next.machine.current_step = payload.step as State["machine"]["current_step"];
      next.machine.cycle_id = payload.cycle_id as number;
      next.machine.step_started_at = event.timestamp;
      break;
    case "STEP_COMPLETED":
      next.machine.step_started_at = null;
      break;
    case "STEP_FAILED":
      next.machine.status = "FAULT";
      next.machine.current_step = payload.step as State["machine"]["current_step"];
      break;
    case "ACTIVITY_LEVEL":
    case "ACTIVITY_DETECTED":
    case "ACTIVITY_CLEARED": {
      const score = payload.activity_score as number;
      next.sensor.activity_score = score;
      next.sensor.method = payload.method as State["sensor"]["method"];
      next.sensor.last_update_at = event.timestamp;
      next.sensor.connected = true;
      if (event.event_type === "ACTIVITY_DETECTED") {
        next.sensor.active = true;
      } else if (event.event_type === "ACTIVITY_CLEARED") {
        next.sensor.active = false;
      }
      break;
    }
    default:
      break;
  }

  return next;
}

export function streamReducer(state: StreamSnapshot, action: StreamAction): StreamSnapshot {
  switch (action.type) {
    case "status":
      return { ...state, status: action.status, statusDetail: action.detail ?? null };
    case "ready":
      return { ...state, ready: action.ready };
    case "state":
      return {
        ...state,
        state: action.state,
        events: mergeEvents(state.events, action.state.recent_events),
      };
    case "ack-optimistic": {
      if (!state.state) {
        return state;
      }
      const current = state.state.alerts.find((item) => item.alert_id === action.alertId);
      if (!current || current.acknowledged) {
        return state;
      }
      const alert: Alert = {
        ...current,
        acknowledged: true,
        acknowledged_by: action.acknowledgedBy,
        acknowledged_at: action.acknowledgedAt,
      };
      return {
        ...state,
        state: { ...state.state, alerts: sortAlerts(upsertAlert(state.state.alerts, alert)) },
      };
    }
    case "ack-rollback":
      if (!state.state) {
        return state;
      }
      return {
        ...state,
        state: { ...state.state, alerts: sortAlerts(upsertAlert(state.state.alerts, action.alert)) },
      };
    case "event": {
      if (state.events.some((item) => item.event_id === action.event.event_id)) {
        return state;
      }
      const events = [action.event, ...state.events].slice(0, MAX_EVENTS);
      let samples = state.samples;
      const payload = asRecord(action.event.payload);
      if (
        action.event.event_type === "ACTIVITY_LEVEL" ||
        action.event.event_type === "ACTIVITY_DETECTED" ||
        action.event.event_type === "ACTIVITY_CLEARED"
      ) {
        const now = action.now ?? Date.parse(action.event.timestamp);
        const threshold =
          typeof payload.threshold === "number" ? payload.threshold : lastThreshold(samples);
        const score = payload.activity_score as number;
        samples = [
          ...samples,
          {
            t: now,
            score,
            threshold,
            active: action.event.event_type === "ACTIVITY_CLEARED" ? false :
              action.event.event_type === "ACTIVITY_DETECTED" ||
              (state.state?.sensor.active ?? samples[samples.length - 1]?.active ?? false),
          },
        ]
          .filter((sample) => sample.t >= now - SAMPLE_WINDOW_MS)
          .slice(-MAX_SAMPLES);
      }
      return {
        ...state,
        events,
        samples,
        state: state.state ? applyEventToState(state.state, action.event) : state.state,
      };
    }
    case "alert":
      if (!state.state) {
        return state;
      }
      return {
        ...state,
        state: {
          ...state.state,
          alerts: sortAlerts(upsertAlert(state.state.alerts, action.alert)),
        },
      };
  }
}
