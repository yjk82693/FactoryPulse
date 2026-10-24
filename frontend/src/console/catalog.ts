import type { ConsoleCatalog, MotionProfile, ProfileTemplate } from "./types";

const pressPhases: ProfileTemplate["phases"] = [
  { id: "approach", name: "APPROACH", expectedActivity: 0.28, durationTicks: 6 },
  { id: "press", name: "PRESS", expectedActivity: 0.82, durationTicks: 8 },
  { id: "retract", name: "RETRACT", expectedActivity: 0.24, durationTicks: 6 },
];

const pickerPhases: ProfileTemplate["phases"] = [
  { id: "reach", name: "REACH", expectedActivity: 0.35, durationTicks: 5 },
  { id: "grip", name: "GRIP", expectedActivity: 0.7, durationTicks: 4 },
  { id: "place", name: "PLACE", expectedActivity: 0.4, durationTicks: 5 },
];

const conveyorPhases: ProfileTemplate["phases"] = [
  { id: "idle-belt", name: "IDLE BELT", expectedActivity: 0.18, durationTicks: 4 },
  { id: "flow", name: "FLOW", expectedActivity: 0.55, durationTicks: 10 },
];

export const SEED_TEMPLATES: ProfileTemplate[] = [
  { id: "tpl-press", name: "Press cycle", machineKind: "press", version: 1, phases: pressPhases },
  { id: "tpl-picker", name: "Picker cycle", machineKind: "picker", version: 1, phases: pickerPhases },
  { id: "tpl-conveyor", name: "Conveyor flow", machineKind: "conveyor", version: 1, phases: conveyorPhases },
];

export function profileFromTemplate(template: ProfileTemplate, id: string, name: string): MotionProfile {
  return {
    id,
    templateId: template.id,
    name,
    machineKind: template.machineKind,
    version: template.version,
    phases: template.phases.map((phase) => ({ ...phase })),
    calibrations: [],
  };
}

export function seedCatalog(): ConsoleCatalog {
  const templates = SEED_TEMPLATES;
  const profiles: MotionProfile[] = [
    {
      ...profileFromTemplate(templates[0]!, "prf-press-1", "Press — cell A"),
      calibrations: [
        { machineId: "mch-press-01", state: "calibrated", version: 1, notes: "Synthetic install baseline" },
      ],
    },
    profileFromTemplate(templates[1]!, "prf-picker-1", "Picker — cell A"),
    profileFromTemplate(templates[2]!, "prf-conv-1", "Conveyor — aisle B"),
  ];
  return {
    zones: [
      { id: "zone-a", name: "Zone A — press cell" },
      { id: "zone-b", name: "Zone B — packing aisle" },
    ],
    templates,
    profiles,
    machines: [
      {
        id: "mch-press-01",
        name: "Press-01",
        kind: "press",
        zoneId: "zone-a",
        status: "RUNNING",
        profileId: "prf-press-1",
        sensorLinkIds: ["lnk-a-shared"],
      },
      {
        id: "mch-picker-01",
        name: "Picker-01",
        kind: "picker",
        zoneId: "zone-a",
        status: "IDLE",
        profileId: "prf-picker-1",
        sensorLinkIds: ["lnk-a-shared"],
      },
      {
        id: "mch-conv-01",
        name: "Conveyor-01",
        kind: "conveyor",
        zoneId: "zone-b",
        status: "RUNNING",
        profileId: "prf-conv-1",
        sensorLinkIds: ["lnk-b-dedicated"],
      },
    ],
    links: [
      {
        id: "lnk-a-shared",
        name: "CSI link Zone A",
        mode: "shared_zone",
        zoneId: "zone-a",
        machineIds: ["mch-press-01", "mch-picker-01"],
      },
      {
        id: "lnk-b-dedicated",
        name: "CSI link Conveyor-01",
        mode: "dedicated",
        zoneId: "zone-b",
        machineIds: ["mch-conv-01"],
      },
    ],
    physicalSensors: [],
    selectedMachineId: "mch-press-01",
  };
}

export function emptyCatalog(): ConsoleCatalog {
  return {
    zones: [],
    templates: [],
    profiles: [],
    machines: [],
    links: [],
    physicalSensors: [],
    selectedMachineId: null,
  };
}
