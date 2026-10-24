export type MachineKind = "press" | "picker" | "conveyor";
export type OperatingStatus = "IDLE" | "RUNNING" | "MAINTENANCE" | "STOPPED";
export type CalibrationState = "uncalibrated" | "calibrating" | "calibrated";
export type SensingMode = "dedicated" | "shared_zone";
export type SimScenario = "normal" | "short_disturbance" | "sustained_deviation" | "missing_motion";
export type DetectorPhase = "normal" | "pending" | "alert";

export interface Zone {
  id: string;
  name: string;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  expectedActivity: number;
  durationTicks: number;
}

export interface ProfileTemplate {
  id: string;
  name: string;
  machineKind: MachineKind;
  version: number;
  phases: PhaseTemplate[];
}

export interface InstallationCalibration {
  machineId: string;
  state: CalibrationState;
  version: number;
  notes: string;
}

export interface MotionProfile {
  id: string;
  templateId: string;
  name: string;
  machineKind: MachineKind;
  version: number;
  versionId?: string;
  phases: PhaseTemplate[];
  calibrations: InstallationCalibration[];
}

export interface MachineRecord {
  id: string;
  name: string;
  kind: MachineKind;
  zoneId: string;
  status: OperatingStatus;
  profileId: string;
  sensorLinkIds: string[];
  liveCellId?: string | null;
}

export interface SensorLink {
  id: string;
  name: string;
  mode: SensingMode;
  zoneId: string;
  machineIds: string[];
  physicalSensorId?: string | null;
  ambiguityLevel?: "low" | "high";
  ambiguitySummary?: string;
}

export interface PhysicalSensor {
  id: string;
  boundMachineId: string;
  active: boolean;
}

export interface ReviewAlert {
  id: string;
  machineId: string;
  openedAtTick: number;
  clearedAtTick: number | null;
  score: number;
  message: string;
}

export interface ActivityPoint {
  t: number;
  expected: number;
  observed: number;
}

export interface DetectorConfig {
  scoreThreshold: number;
  persistTicks: number;
  recoverTicks: number;
  hysteresis: number;
}

export interface DetectorSnapshot {
  phase: DetectorPhase;
  pendingTicks: number;
  recoverTicks: number;
  score: number;
  openAlertId: string | null;
}

export interface PlacementStrategy {
  id: "dedicated" | "shared_zone" | "mixed";
  label: string;
  sensorCount: number;
  hardwareCost: number;
  coverage: number;
  ambiguity: number;
  notes: string;
}

export interface ConsoleCatalog {
  zones: Zone[];
  templates: ProfileTemplate[];
  profiles: MotionProfile[];
  machines: MachineRecord[];
  links: SensorLink[];
  physicalSensors: PhysicalSensor[];
  selectedMachineId: string | null;
}

export type ConsoleSourceKind = "memory" | "http";

export interface ConsoleMeta {
  source: ConsoleSourceKind;
  loading: boolean;
  error: string | null;
}

export class ConsoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsoleError";
  }
}

export const KIND_LABEL: Record<MachineKind, string> = {
  press: "Press",
  picker: "Picker",
  conveyor: "Conveyor",
};
