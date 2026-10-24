import { describe, expect, it } from "vitest";
import { MemoryConsoleStore } from "./store";
import { ConsoleError } from "./types";

describe("MemoryConsoleStore", () => {
  it("creates, updates, selects, and deletes machines", () => {
    const store = new MemoryConsoleStore();
    const created = store.createMachine({
      name: "Press-02",
      kind: "press",
      zoneId: "zone-a",
      status: "IDLE",
      profileId: "prf-press-1",
    });
    expect(store.getSnapshot().selectedMachineId).toBe(created.id);
    store.updateMachine(created.id, { status: "RUNNING" });
    expect(store.getSnapshot().machines.find((item) => item.id === created.id)?.status).toBe("RUNNING");
    store.deleteMachine(created.id);
    expect(store.getSnapshot().machines.some((item) => item.id === created.id)).toBe(false);
  });

  it("rejects a profile of the wrong machine type", () => {
    const store = new MemoryConsoleStore();
    expect(() =>
      store.createMachine({
        name: "Bad",
        kind: "press",
        zoneId: "zone-a",
        status: "IDLE",
        profileId: "prf-picker-1",
      }),
    ).toThrow(ConsoleError);
  });

  it("versions per-installation calibration without treating it as CSI truth", () => {
    const store = new MemoryConsoleStore();
    store.setCalibration("prf-press-1", "mch-press-01", "calibrating");
    store.setCalibration("prf-press-1", "mch-press-01", "calibrated");
    const record = store
      .getSnapshot()
      .profiles.find((item) => item.id === "prf-press-1")
      ?.calibrations.find((item) => item.machineId === "mch-press-01");
    expect(record?.state).toBe("calibrated");
    expect(record?.version).toBe(2);
  });

  it("enforces dedicated links to a single machine", () => {
    const store = new MemoryConsoleStore();
    expect(() =>
      store.upsertLink({
        name: "Bad dedicated",
        mode: "dedicated",
        zoneId: "zone-a",
        machineIds: ["mch-press-01", "mch-picker-01"],
      }),
    ).toThrow(ConsoleError);
  });
});
