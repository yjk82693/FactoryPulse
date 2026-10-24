export type EventSourceKind = "machine" | "sensor" | "system";

export type EventType =
  | "STEP_STARTED"
  | "STEP_COMPLETED"
  | "STEP_FAILED"
  | "ACTIVITY_LEVEL"
  | "ACTIVITY_DETECTED"
  | "ACTIVITY_CLEARED"
  | "ALERT_CREATED"
  | "ALERT_ACKNOWLEDGED";

export type Step = "PICK" | "MOVE" | "ASSEMBLE" | "RETURN";
export type Method = "wifi_csi" | "simulated";
export type MachineStatus = "IDLE" | "RUNNING" | "FAULT" | "MAINTENANCE";
export type Rule = "ACTIVITY_REVIEW" | "ACTIVITY_INFO" | "STEP_DELAY" | "STEP_FAILURE";
export type Severity = "info" | "warning" | "critical";
export type Role = "operator" | "supervisor";
export type AuthMode = "disabled" | "auth0";
export type Persistence = "memory" | "tiger_data";

export const STEPS: Step[] = ["PICK", "MOVE", "ASSEMBLE", "RETURN"];

export const EXPECTED_MS: Record<Step, number> = {
  PICK: 2000,
  MOVE: 3000,
  ASSEMBLE: 5000,
  RETURN: 2000,
};

export interface StepStartedPayload {
  step: Step;
  cycle_id: number;
}

export interface StepCompletedPayload {
  step: Step;
  cycle_id: number;
  duration_ms: number;
  expected_ms: number;
}

export interface StepFailedPayload {
  step: Step;
  cycle_id: number;
  reason: string;
}

export interface ActivityLevelPayload {
  activity_score: number;
  method: Method;
  baseline: number;
}

export interface ActivityDetectedPayload {
  activity_score: number;
  threshold: number;
  method: Method;
}

export interface ActivityClearedPayload {
  activity_score: number;
  method: Method;
}

export interface AlertCreatedPayload {
  alert_id: string;
  rule: Rule;
  severity: Severity;
  message: string;
  related_event_ids: string[];
}

export interface AlertAcknowledgedPayload {
  alert_id: string;
  acknowledged_by: string;
}

export type EventPayload =
  | StepStartedPayload
  | StepCompletedPayload
  | StepFailedPayload
  | ActivityLevelPayload
  | ActivityDetectedPayload
  | ActivityClearedPayload
  | AlertCreatedPayload
  | AlertAcknowledgedPayload;

export interface Event {
  event_id: string;
  timestamp: string;
  source: EventSourceKind;
  event_type: EventType;
  machine_id: string;
  payload: EventPayload;
}

export interface Alert {
  alert_id: string;
  rule: Rule;
  severity: Severity;
  message: string;
  created_at: string;
  cycle_id: number;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  related_event_ids: string[];
}

export interface State {
  server: {
    auth_mode: AuthMode;
    persistence: Persistence;
    voice_enabled: boolean;
    explain_enabled: boolean;
  };
  company: { id: string; name: string };
  machine: {
    machine_id: string;
    status: MachineStatus;
    current_step: Step | null;
    cycle_id: number;
    step_started_at: string | null;
    simulated: boolean;
  };
  sensor: {
    activity_score: number;
    active: boolean;
    method: Method;
    last_update_at: string | null;
    connected: boolean;
  };
  alerts: Alert[];
  recent_events: Event[];
}

export interface Ready {
  auth_mode: AuthMode;
  user: { id: string; name: string };
  company: { id: string; name: string };
}

export interface MeResponse {
  user: { id: string; name: string; email: string | null };
  company: { id: string; name: string };
  role: Role;
}

export interface ApiError {
  detail: string;
  code: string;
}

export type WsMessage =
  | { type: "ready"; data: Ready }
  | { type: "state"; data: State }
  | { type: "event"; data: Event }
  | { type: "alert"; data: Alert }
  | { type: "ping" };

export interface WsAuthMessage {
  type: "auth";
  token: string;
}
