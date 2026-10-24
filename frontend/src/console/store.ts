import { seedCatalog } from "./catalog";
import { ConsoleError, type ConsoleCatalog, type ConsoleMeta, type ConsoleSourceKind, type MachineKind, type MachineRecord, type MotionProfile, type OperatingStatus, type SensingMode, type SensorLink } from "./types";

function cloneCatalog(catalog: ConsoleCatalog): ConsoleCatalog {
  return structuredClone(catalog);
}

export interface ConsoleStore {
  readonly source: ConsoleSourceKind;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ConsoleCatalog;
  getMeta: () => ConsoleMeta;
  refresh(): Promise<void>;
  reset(): void;
  selectMachine(id: string | null): void;
  createMachine(input: {
    name: string;
    kind: MachineKind;
    zoneId: string;
    status: OperatingStatus;
    profileId: string;
  }): MachineRecord | Promise<MachineRecord>;
  updateMachine(id: string, patch: Partial<Omit<MachineRecord, "id">>): MachineRecord | Promise<MachineRecord>;
  deleteMachine(id: string): void | Promise<void>;
  createProfileFromTemplate(templateId: string, name: string): MotionProfile | Promise<MotionProfile>;
  setCalibration(
    profileId: string,
    machineId: string,
    state: MotionProfile["calibrations"][0]["state"],
  ): void | Promise<void>;
  upsertLink(input: {
    id?: string;
    name: string;
    mode: SensingMode;
    zoneId: string;
    machineIds: string[];
    physicalSensorId?: string | null;
  }): SensorLink | Promise<SensorLink>;
  deleteLink(id: string): void | Promise<void>;
}

export class MemoryConsoleStore implements ConsoleStore {
  readonly source = "memory" as const;
  private catalog = seedCatalog();
  private seq = 100;
  private listeners = new Set<() => void>();

  private readonly meta: ConsoleMeta = { source: "memory", loading: false, error: null };

  getMeta = (): ConsoleMeta => this.meta;

  refresh = async (): Promise<void> => {
    /* In-memory mocks have no remote snapshot. */
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConsoleCatalog => this.catalog;

  private emit(): void {
    this.catalog = cloneCatalog(this.catalog);
    this.listeners.forEach((listener) => listener());
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  reset(): void {
    this.catalog = seedCatalog();
    this.seq = 100;
    this.emit();
  }

  selectMachine(id: string | null): void {
    this.catalog.selectedMachineId = id;
    this.emit();
  }

  createMachine(input: {
    name: string;
    kind: MachineKind;
    zoneId: string;
    status: OperatingStatus;
    profileId: string;
  }): MachineRecord {
    const name = input.name.trim();
    if (!name) {
      throw new ConsoleError("Machine name is required.");
    }
    if (!this.catalog.zones.some((zone) => zone.id === input.zoneId)) {
      throw new ConsoleError("Unknown zone.");
    }
    const profile = this.catalog.profiles.find((item) => item.id === input.profileId);
    if (!profile || profile.machineKind !== input.kind) {
      throw new ConsoleError("Profile must match the machine type.");
    }
    const machine: MachineRecord = {
      id: this.nextId("mch"),
      name,
      kind: input.kind,
      zoneId: input.zoneId,
      status: input.status,
      profileId: input.profileId,
      sensorLinkIds: [],
    };
    this.catalog.machines = [...this.catalog.machines, machine];
    this.catalog.selectedMachineId = machine.id;
    this.emit();
    return machine;
  }

  updateMachine(id: string, patch: Partial<Omit<MachineRecord, "id">>): MachineRecord {
    const index = this.catalog.machines.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new ConsoleError("Machine not found.");
    }
    const current = this.catalog.machines[index]!;
    const next = { ...current, ...patch, id };
    if (patch.profileId) {
      const profile = this.catalog.profiles.find((item) => item.id === patch.profileId);
      if (!profile || profile.machineKind !== next.kind) {
        throw new ConsoleError("Profile must match the machine type.");
      }
    }
    this.catalog.machines = this.catalog.machines.map((item) => (item.id === id ? next : item));
    this.emit();
    return next;
  }

  deleteMachine(id: string): void {
    if (!this.catalog.machines.some((item) => item.id === id)) {
      throw new ConsoleError("Machine not found.");
    }
    this.catalog.machines = this.catalog.machines.filter((item) => item.id !== id);
    this.catalog.links = this.catalog.links.map((link) => ({
      ...link,
      machineIds: link.machineIds.filter((machineId) => machineId !== id),
    }));
    if (this.catalog.selectedMachineId === id) {
      this.catalog.selectedMachineId = this.catalog.machines[0]?.id ?? null;
    }
    this.emit();
  }

  createProfileFromTemplate(templateId: string, name: string): MotionProfile {
    const template = this.catalog.templates.find((item) => item.id === templateId);
    if (!template) {
      throw new ConsoleError("Unknown template.");
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ConsoleError("Profile name is required.");
    }
    const profile: MotionProfile = {
      id: this.nextId("prf"),
      templateId: template.id,
      name: trimmed,
      machineKind: template.machineKind,
      version: template.version,
      phases: template.phases.map((phase) => ({ ...phase })),
      calibrations: [],
    };
    this.catalog.profiles = [...this.catalog.profiles, profile];
    this.emit();
    return profile;
  }

  setCalibration(profileId: string, machineId: string, state: MotionProfile["calibrations"][0]["state"]): void {
    const profile = this.catalog.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new ConsoleError("Profile not found.");
    }
    const existing = profile.calibrations.find((item) => item.machineId === machineId);
    const next = existing
      ? {
          ...existing,
          state,
          version: state === "calibrated" ? existing.version + 1 : existing.version,
          notes: state === "calibrated" ? "Installation recapture (synthetic)" : existing.notes,
        }
      : {
          machineId,
          state,
          version: state === "calibrated" ? 1 : 0,
          notes: "Synthetic calibration record",
        };
    profile.calibrations = [...profile.calibrations.filter((item) => item.machineId !== machineId), next];
    this.emit();
  }

  upsertLink(input: {
    id?: string;
    name: string;
    mode: SensingMode;
    zoneId: string;
    machineIds: string[];
    physicalSensorId?: string | null;
  }): SensorLink {
    const name = input.name.trim();
    if (!name) {
      throw new ConsoleError("Link name is required.");
    }
    const unique = [...new Set(input.machineIds)];
    if (input.mode === "dedicated" && unique.length !== 1) {
      throw new ConsoleError("A dedicated link must map to exactly one machine.");
    }
    if (input.mode === "shared_zone" && unique.length < 1) {
      throw new ConsoleError("A shared-zone link needs at least one machine.");
    }
    const link: SensorLink = {
      id: input.id ?? this.nextId("lnk"),
      name,
      mode: input.mode,
      zoneId: input.zoneId,
      machineIds: unique,
      physicalSensorId: input.physicalSensorId ?? null,
    };
    const others = this.catalog.links.filter((item) => item.id !== link.id);
    this.catalog.links = [...others, link];
    this.catalog.machines = this.catalog.machines.map((machine) => ({
      ...machine,
      sensorLinkIds: [
        ...machine.sensorLinkIds.filter((id) => id !== link.id),
        ...(link.machineIds.includes(machine.id) ? [link.id] : []),
      ],
    }));
    this.emit();
    return link;
  }

  deleteLink(id: string): void {
    this.catalog.links = this.catalog.links.filter((item) => item.id !== id);
    this.catalog.machines = this.catalog.machines.map((machine) => ({
      ...machine,
      sensorLinkIds: machine.sensorLinkIds.filter((linkId) => linkId !== id),
    }));
    this.emit();
  }
}

