import { describe, expect, it } from "vitest";
import { ConsoleError } from "./types";
import { mapCatalog, mapPhase } from "./wire";

const catalog = {
  zones: [{ id: "zone-a", name: "Zone A" }],
  templates: [
    {
      id: "tpl-press",
      name: "Press cycle",
      machine_kind: "press",
      version: 1,
      phases: [{ id: "press", name: "PRESS", expected_activity: 0.8, duration_ticks: 8 }],
    },
  ],
  profiles: [
    {
      id: "prf-1",
      template_id: "tpl-press",
      name: "Press — cell A",
      machine_kind: "press",
      current_version: 2,
    },
  ],
  profile_versions: [
    {
      id: "ver-1",
      profile_id: "prf-1",
      version: 1,
      phases: [{ id: "press", name: "PRESS", expected_activity: 0.7, duration_ticks: 8 }],
    },
    {
      id: "ver-2",
      profile_id: "prf-1",
      version: 2,
      phases: [{ id: "press", name: "PRESS", expected_activity: 0.9, duration_ticks: 8 }],
    },
  ],
  calibrations: [
    {
      id: "cal-1",
      profile_id: "prf-1",
      profile_version_id: "ver-2",
      machine_id: "mch-1",
      state: "calibrated",
      version: 1,
      notes: "Synthetic install baseline",
    },
  ],
  machines: [
    {
      id: "mch-1",
      name: "Press-01",
      kind: "press",
      zone_id: "zone-a",
      operating_status: "RUNNING",
      profile_id: "prf-1",
      live_cell_id: "assembly_01",
      sensor_link_ids: ["lnk-1"],
    },
  ],
  sensors: [{ id: "csi-rx-01", bound_machine_id: "assembly_01", active: true }],
  sensing_links: [
    {
      id: "lnk-1",
      name: "CSI link Zone A",
      mode: "shared_zone",
      zone_id: "zone-a",
      machine_ids: ["mch-1"],
      ambiguity: { level: "high", summary: "Hypotheses only." },
    },
  ],
};

describe("console wire mapping", () => {
  it("maps snake_case catalog fields onto ConsoleCatalog", () => {
    const mapped = mapCatalog(catalog);
    expect(mapped.machines[0]?.status).toBe("RUNNING");
    expect(mapped.machines[0]?.zoneId).toBe("zone-a");
    expect(mapped.machines[0]?.liveCellId).toBe("assembly_01");
    expect(mapped.profiles[0]?.version).toBe(2);
    expect(mapped.profiles[0]?.versionId).toBe("ver-2");
    expect(mapped.profiles[0]?.phases[0]?.expectedActivity).toBe(0.9);
    expect(mapped.profiles[0]?.calibrations[0]?.machineId).toBe("mch-1");
    expect(mapped.links[0]?.ambiguityLevel).toBe("high");
    expect(mapped.physicalSensors[0]?.boundMachineId).toBe("assembly_01");
  });

  it("rejects a sensor payload that includes a raw key", () => {
    expect(() =>
      mapCatalog({
        ...catalog,
        sensors: [{ id: "csi-rx-01", bound_machine_id: "assembly_01", active: true, key: "secret" }],
      }),
    ).toThrow(ConsoleError);
  });

  it("maps phase expected_activity", () => {
    expect(mapPhase({ id: "a", name: "A", expected_activity: 0.2, duration_ticks: 3 })).toEqual({
      id: "a",
      name: "A",
      expectedActivity: 0.2,
      durationTicks: 3,
    });
  });
});
