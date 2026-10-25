import { ApiClientError, type ApiClient } from "../services/api";
import { emptyCatalog } from "./catalog";
import { ConsoleError, type ConsoleCatalog, type ConsoleMeta, type MachineKind, type MachineRecord, type MotionProfile, type OperatingStatus, type SensingMode, type SensorLink } from "./types";
import { linkToWire, machinePatchToWire, machineToWire, mapCatalog } from "./wire";
import type { ConsoleStore } from "./store";

function cloneCatalog(catalog: ConsoleCatalog): ConsoleCatalog {
  return structuredClone(catalog);
}

function createdId(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null && "id" in raw && typeof (raw as { id: unknown }).id === "string") {
    return (raw as { id: string }).id;
  }
  return null;
}

function toConsoleError(error: unknown): ConsoleError {
  if (error instanceof ConsoleError) {
    return error;
  }
  if (error instanceof ApiClientError) {
    if (error.status === 404 || error.status === 501) {
      return new ConsoleError(
        "Unable to load Console catalog from the API. Last known Console data is kept; mock seed data is not used.",
      );
    }
    if (error.code === "profile_kind_mismatch") {
      return new ConsoleError("Profile must match the machine type.");
    }
    if (error.code === "dedicated_link_requires_one_machine") {
      return new ConsoleError("A dedicated link must map to exactly one machine.");
    }
    if (error.code === "immutable_version") {
      return new ConsoleError("Profile versions are immutable.");
    }
    if (error.status === 403) {
      return new ConsoleError("You do not have permission to change Console configuration.");
    }
    return new ConsoleError(error.detail);
  }
  return new ConsoleError("Unable to reach the Console API.");
}

export class HttpConsoleStore implements ConsoleStore {
  readonly source = "http" as const;
  private catalog = emptyCatalog();
  private meta: ConsoleMeta = { source: "http", loading: true, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly api: ApiClient;
  private refreshQueued: Promise<void> | null = null;

  constructor(api: ApiClient) {
    this.api = api;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConsoleCatalog => this.catalog;

  getMeta = (): ConsoleMeta => this.meta;

  private emit(): void {
    this.catalog = cloneCatalog(this.catalog);
    this.listeners.forEach((listener) => listener());
  }

  async refresh(): Promise<void> {
    if (this.refreshQueued) {
      return this.refreshQueued;
    }
    this.meta = { source: "http", loading: true, error: this.meta.error };
    this.emit();
    this.refreshQueued = this.loadCatalog().finally(() => {
      this.refreshQueued = null;
    });
    return this.refreshQueued;
  }

  private async loadCatalog(): Promise<void> {
    const selected = this.catalog.selectedMachineId;
    try {
      const raw = await this.api.requestJson<unknown>("/api/console/catalog");
      this.catalog = mapCatalog(raw, selected);
      this.meta = { source: "http", loading: false, error: null };
    } catch (error) {
      this.meta = { source: "http", loading: false, error: toConsoleError(error).message };
      if (this.catalog.machines.length === 0 && this.catalog.zones.length === 0) {
        this.catalog = emptyCatalog();
      }
    } finally {
      this.emit();
    }
  }

  reset(): void {
    this.catalog = emptyCatalog();
    this.meta = { source: "http", loading: true, error: null };
    this.emit();
    void this.refresh();
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
  }): Promise<MachineRecord> {
    return this.mutate(async () => {
      const name = input.name.trim();
      if (!name) {
        throw new ConsoleError("Machine name is required.");
      }
      const created = await this.api.requestJson<unknown>("/api/console/machines", {
        method: "POST",
        body: JSON.stringify(machineToWire({ ...input, name })),
      });
      const id = createdId(created);
      await this.refresh();
      const mapped = id
        ? this.catalog.machines.find((item) => item.id === id)
        : this.catalog.machines.find((item) => item.name === name);
      if (!mapped) {
        throw new ConsoleError("Machine was created but not returned in the catalog.");
      }
      this.catalog.selectedMachineId = mapped.id;
      this.emit();
      return mapped;
    });
  }

  updateMachine(id: string, patch: Partial<Omit<MachineRecord, "id">>): Promise<MachineRecord> {
    return this.mutate(async () => {
      await this.api.requestJson(`/api/console/machines/${id}`, {
        method: "PATCH",
        body: JSON.stringify(machinePatchToWire(patch)),
      });
      await this.refresh();
      const next = this.catalog.machines.find((item) => item.id === id);
      if (!next) {
        throw new ConsoleError("Machine not found.");
      }
      return next;
    });
  }

  deleteMachine(id: string): Promise<void> {
    return this.mutate(async () => {
      await this.api.request(`/api/console/machines/${id}`, { method: "DELETE" });
      await this.refresh();
    });
  }

  createProfileFromTemplate(templateId: string, name: string): Promise<MotionProfile> {
    return this.mutate(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ConsoleError("Profile name is required.");
      }
      const created = await this.api.requestJson<unknown>("/api/console/profiles", {
        method: "POST",
        body: JSON.stringify({ template_id: templateId, name: trimmed }),
      });
      const id = createdId(created);
      await this.refresh();
      const profile = id
        ? this.catalog.profiles.find((item) => item.id === id)
        : this.catalog.profiles.find((item) => item.name === trimmed);
      if (!profile) {
        throw new ConsoleError("Profile was created but not returned in the catalog.");
      }
      return profile;
    });
  }

  setCalibration(
    profileId: string,
    machineId: string,
    state: MotionProfile["calibrations"][0]["state"],
  ): Promise<void> {
    return this.mutate(async () => {
      const profile = this.catalog.profiles.find((item) => item.id === profileId);
      if (!profile) {
        throw new ConsoleError("Profile not found.");
      }
      if (!profile.versionId) {
        throw new ConsoleError("Profile version id is missing; cannot calibrate.");
      }
      await this.api.requestJson("/api/console/calibrations", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profileId,
          profile_version_id: profile.versionId,
          machine_id: machineId,
          state,
          notes: state === "calibrated" ? "Installation recapture (not a measured RF fingerprint)" : "Calibration in progress",
        }),
      });
      await this.refresh();
    });
  }

  upsertLink(input: {
    id?: string;
    name: string;
    mode: SensingMode;
    zoneId: string;
    machineIds: string[];
    physicalSensorId?: string | null;
  }): Promise<SensorLink> {
    return this.mutate(async () => {
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
      const body = JSON.stringify(linkToWire({ ...input, name, machineIds: unique }));
      if (input.id) {
        await this.api.requestJson(`/api/console/sensing-links/${input.id}`, { method: "PUT", body });
      } else {
        await this.api.requestJson("/api/console/sensing-links", { method: "POST", body });
      }
      await this.refresh();
      const link = this.catalog.links.find((item) => item.name === name || item.id === input.id);
      if (!link) {
        throw new ConsoleError("Sensing link was saved but not returned in the catalog.");
      }
      return link;
    });
  }

  deleteLink(id: string): Promise<void> {
    return this.mutate(async () => {
      await this.api.request(`/api/console/sensing-links/${id}`, { method: "DELETE" });
      await this.refresh();
    });
  }

  private async mutate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const mapped = toConsoleError(error);
      this.meta = { source: "http", loading: false, error: mapped.message };
      this.emit();
      throw mapped;
    }
  }
}
