import { ConsoleError, type CalibrationState, type ConsoleCatalog, type InstallationCalibration, type MachineKind, type MachineRecord, type MotionProfile, type OperatingStatus, type PhaseTemplate, type PhysicalSensor, type ProfileTemplate, type SensingMode, type SensorLink, type Zone } from "./types";

export interface WirePhase {
  id: string;
  name: string;
  expected_activity: number;
  duration_ticks: number;
}

export interface WireProfileTemplate {
  id: string;
  name: string;
  machine_kind: MachineKind;
  version: number;
  phases: WirePhase[];
}

export interface WireProfile {
  id: string;
  template_id: string;
  name: string;
  machine_kind: MachineKind;
  current_version: number;
  created_at?: string;
  phases?: WirePhase[];
}

export interface WireProfileVersion {
  id: string;
  profile_id: string;
  version: number;
  phases: WirePhase[];
  created_at?: string;
  created_by?: string;
}

export interface WireCalibration {
  id: string;
  profile_id: string;
  profile_version_id: string;
  machine_id: string;
  state: CalibrationState;
  version: number;
  notes: string;
  updated_at?: string;
}

export interface WireMachine {
  id: string;
  name: string;
  kind: MachineKind;
  zone_id: string;
  operating_status: OperatingStatus;
  profile_id: string;
  live_cell_id?: string | null;
  sensor_link_ids: string[];
  created_at?: string;
}

export interface WireSensingLink {
  id: string;
  name: string;
  mode: SensingMode;
  zone_id: string;
  machine_ids: string[];
  physical_sensor_id?: string | null;
  ambiguity?: { level: "low" | "high"; summary: string };
}

export interface WirePhysicalSensor {
  id: string;
  company_id?: string;
  bound_machine_id: string;
  active: boolean;
  key_fingerprint?: string;
  created_at?: string;
}

export interface WireCatalog {
  zones: Zone[];
  templates: WireProfileTemplate[];
  profiles: WireProfile[];
  profile_versions: WireProfileVersion[];
  calibrations: WireCalibration[];
  machines: WireMachine[];
  sensors: WirePhysicalSensor[];
  sensing_links: WireSensingLink[];
}

const KINDS: MachineKind[] = ["press", "picker", "conveyor"];
const STATUSES: OperatingStatus[] = ["IDLE", "RUNNING", "MAINTENANCE", "STOPPED"];
const MODES: SensingMode[] = ["dedicated", "shared_zone"];
const CAL_STATES: CalibrationState[] = ["uncalibrated", "calibrating", "calibrated"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConsoleError(`Console catalog field ${field} is invalid.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ConsoleError(`Console catalog field ${field} is invalid.`);
  }
  return value;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ConsoleError(`Console catalog field ${field} is invalid.`);
  }
  return value;
}

function asKind(value: unknown, field: string): MachineKind {
  const kind = asString(value, field);
  if (!KINDS.includes(kind as MachineKind)) {
    throw new ConsoleError(`Console catalog field ${field} is invalid.`);
  }
  return kind as MachineKind;
}

export function mapPhase(raw: unknown): PhaseTemplate {
  if (!isRecord(raw)) {
    throw new ConsoleError("Console catalog field phases is invalid.");
  }
  return {
    id: asString(raw.id, "phase.id"),
    name: asString(raw.name, "phase.name"),
    expectedActivity: asNumber(raw.expected_activity, "phase.expected_activity"),
    durationTicks: asNumber(raw.duration_ticks, "phase.duration_ticks"),
  };
}

function mapTemplate(raw: unknown): ProfileTemplate {
  if (!isRecord(raw)) {
    throw new ConsoleError("Console catalog field templates is invalid.");
  }
  return {
    id: asString(raw.id, "template.id"),
    name: asString(raw.name, "template.name"),
    machineKind: asKind(raw.machine_kind, "template.machine_kind"),
    version: asNumber(raw.version, "template.version"),
    phases: asArray(raw.phases, "template.phases").map(mapPhase),
  };
}

function mapCalibration(raw: unknown): WireCalibration {
  if (!isRecord(raw)) {
    throw new ConsoleError("Console catalog field calibrations is invalid.");
  }
  const state = asString(raw.state, "calibration.state");
  if (!CAL_STATES.includes(state as CalibrationState)) {
    throw new ConsoleError("Console catalog field calibration.state is invalid.");
  }
  return {
    id: asString(raw.id, "calibration.id"),
    profile_id: asString(raw.profile_id, "calibration.profile_id"),
    profile_version_id: asString(raw.profile_version_id, "calibration.profile_version_id"),
    machine_id: asString(raw.machine_id, "calibration.machine_id"),
    state: state as CalibrationState,
    version: asNumber(raw.version, "calibration.version"),
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

export function mapCatalog(raw: unknown, selectedMachineId: string | null = null): ConsoleCatalog {
  if (!isRecord(raw)) {
    throw new ConsoleError("Console catalog response is invalid.");
  }
  const zones = asArray(raw.zones, "zones").map((item): Zone => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field zones is invalid.");
    }
    return { id: asString(item.id, "zone.id"), name: asString(item.name, "zone.name") };
  });
  const templates = asArray(raw.templates, "templates").map(mapTemplate);
  const versions = asArray(raw.profile_versions ?? [], "profile_versions").map((item) => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field profile_versions is invalid.");
    }
    return {
      id: asString(item.id, "profile_version.id"),
      profile_id: asString(item.profile_id, "profile_version.profile_id"),
      version: asNumber(item.version, "profile_version.version"),
      phases: asArray(item.phases, "profile_version.phases").map(mapPhase),
    };
  });
  const calibrations = asArray(raw.calibrations ?? [], "calibrations").map(mapCalibration);
  const profiles = asArray(raw.profiles, "profiles").map((item): MotionProfile => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field profiles is invalid.");
    }
    const id = asString(item.id, "profile.id");
    const currentVersion = asNumber(item.current_version ?? item.version, "profile.current_version");
    const versionRow =
      versions.find((row) => row.profile_id === id && row.version === currentVersion) ??
      versions.filter((row) => row.profile_id === id).sort((a, b) => b.version - a.version)[0];
    const nestedPhases = Array.isArray(item.phases) ? item.phases.map(mapPhase) : [];
    const nestedCalibrations: InstallationCalibration[] = calibrations
      .filter((row) => row.profile_id === id)
      .map((row) => ({
        machineId: row.machine_id,
        state: row.state,
        version: row.version,
        notes: row.notes,
      }));
    return {
      id,
      templateId: asString(item.template_id, "profile.template_id"),
      name: asString(item.name, "profile.name"),
      machineKind: asKind(item.machine_kind, "profile.machine_kind"),
      version: currentVersion,
      versionId: versionRow?.id,
      phases: versionRow?.phases ?? nestedPhases,
      calibrations: nestedCalibrations,
    };
  });
  const machines = asArray(raw.machines, "machines").map((item): MachineRecord => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field machines is invalid.");
    }
    const status = asString(item.operating_status, "machine.operating_status");
    if (!STATUSES.includes(status as OperatingStatus)) {
      throw new ConsoleError("Console catalog field machine.operating_status is invalid.");
    }
    return {
      id: asString(item.id, "machine.id"),
      name: asString(item.name, "machine.name"),
      kind: asKind(item.kind, "machine.kind"),
      zoneId: asString(item.zone_id, "machine.zone_id"),
      status: status as OperatingStatus,
      profileId: asString(item.profile_id, "machine.profile_id"),
      sensorLinkIds: asArray(item.sensor_link_ids ?? [], "machine.sensor_link_ids").map((id) =>
        asString(id, "machine.sensor_link_ids"),
      ),
      liveCellId: typeof item.live_cell_id === "string" ? item.live_cell_id : null,
    };
  });
  const links = asArray(raw.sensing_links, "sensing_links").map((item): SensorLink => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field sensing_links is invalid.");
    }
    const mode = asString(item.mode, "sensing_link.mode");
    if (!MODES.includes(mode as SensingMode)) {
      throw new ConsoleError("Console catalog field sensing_link.mode is invalid.");
    }
    const ambiguity = isRecord(item.ambiguity) ? item.ambiguity : null;
    return {
      id: asString(item.id, "sensing_link.id"),
      name: asString(item.name, "sensing_link.name"),
      mode: mode as SensingMode,
      zoneId: asString(item.zone_id, "sensing_link.zone_id"),
      machineIds: asArray(item.machine_ids, "sensing_link.machine_ids").map((id) =>
        asString(id, "sensing_link.machine_ids"),
      ),
      physicalSensorId: typeof item.physical_sensor_id === "string" ? item.physical_sensor_id : null,
      ambiguityLevel:
        ambiguity && (ambiguity.level === "low" || ambiguity.level === "high") ? ambiguity.level : undefined,
      ambiguitySummary: ambiguity && typeof ambiguity.summary === "string" ? ambiguity.summary : undefined,
    };
  });
  const physicalSensors = asArray(raw.sensors ?? [], "sensors").map((item): PhysicalSensor => {
    if (!isRecord(item)) {
      throw new ConsoleError("Console catalog field sensors is invalid.");
    }
    if ("key" in item) {
      throw new ConsoleError("Physical sensor responses must not include the ingest key.");
    }
    return {
      id: asString(item.id, "sensor.id"),
      boundMachineId: asString(item.bound_machine_id, "sensor.bound_machine_id"),
      active: item.active === true,
    };
  });
  const selected =
    selectedMachineId && machines.some((item) => item.id === selectedMachineId)
      ? selectedMachineId
      : (machines[0]?.id ?? null);
  return { zones, templates, profiles, machines, links, physicalSensors, selectedMachineId: selected };
}

export function machineToWire(input: {
  name: string;
  kind: MachineKind;
  zoneId: string;
  status: OperatingStatus;
  profileId: string;
  liveCellId?: string | null;
}): Record<string, unknown> {
  return {
    name: input.name,
    kind: input.kind,
    zone_id: input.zoneId,
    operating_status: input.status,
    profile_id: input.profileId,
    ...(input.liveCellId ? { live_cell_id: input.liveCellId } : {}),
  };
}

export function machinePatchToWire(patch: Partial<Omit<MachineRecord, "id">>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.zoneId !== undefined) body.zone_id = patch.zoneId;
  if (patch.status !== undefined) body.operating_status = patch.status;
  if (patch.profileId !== undefined) body.profile_id = patch.profileId;
  if (patch.liveCellId !== undefined) body.live_cell_id = patch.liveCellId;
  return body;
}

export function linkToWire(input: {
  name: string;
  mode: SensingMode;
  zoneId: string;
  machineIds: string[];
  physicalSensorId?: string | null;
}): Record<string, unknown> {
  return {
    name: input.name,
    mode: input.mode,
    zone_id: input.zoneId,
    machine_ids: input.machineIds,
    ...(input.physicalSensorId ? { physical_sensor_id: input.physicalSensorId } : {}),
  };
}
