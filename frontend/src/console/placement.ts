import type { ConsoleCatalog, PlacementStrategy } from "./types";

const UNIT_COST = 1200;

export function evaluatePlacement(catalog: ConsoleCatalog): PlacementStrategy[] {
  const machineCount = catalog.machines.length;
  const zoneCount = catalog.zones.length;
  const mixedCount = zoneCount + Math.max(0, catalog.machines.filter((item) => item.kind === "press").length);
  return [
    {
      id: "dedicated",
      label: "Dedicated links",
      sensorCount: machineCount,
      hardwareCost: machineCount * UNIT_COST,
      coverage: 0.94,
      ambiguity: 0.18,
      notes: "One illustrative link per machine. Still not perfect isolation; cost is highest.",
    },
    {
      id: "shared_zone",
      label: "Shared-zone links",
      sensorCount: zoneCount,
      hardwareCost: zoneCount * UNIT_COST,
      coverage: 0.78,
      ambiguity: 0.72,
      notes: "One link per zone. Lowest hardware cost; overlapping motion is likely.",
    },
    {
      id: "mixed",
      label: "Mixed (press dedicated, others shared)",
      sensorCount: mixedCount,
      hardwareCost: mixedCount * UNIT_COST,
      coverage: 0.88,
      ambiguity: 0.4,
      notes: "Spend hardware on the noisiest cell; remaining machines share a zone link.",
    },
  ];
}

export function recommendPlacement(strategies: PlacementStrategy[]): PlacementStrategy {
  const ranked = [...strategies].sort((a, b) => {
    const score = (item: PlacementStrategy) => item.hardwareCost + item.ambiguity * 4000 - item.coverage * 2000;
    const delta = score(a) - score(b);
    if (delta !== 0) {
      return delta;
    }
    return a.id.localeCompare(b.id);
  });
  return ranked[0]!;
}
