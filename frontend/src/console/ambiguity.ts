import type { ConsoleCatalog, SensorLink } from "./types";

export function linkAmbiguity(link: SensorLink, catalog: ConsoleCatalog): string | null {
  if (link.mode === "dedicated" && link.machineIds.length === 1) {
    return "Dedicated link: still an illustrative radio path, not perfect isolation.";
  }
  const names = catalog.machines
    .filter((machine) => link.machineIds.includes(machine.id))
    .map((machine) => machine.name);
  if (names.length > 1) {
    return `Shared zone: ${names.join(" and ")} may produce overlapping CSI. Machine-level scores are hypotheses.`;
  }
  return null;
}

export function machineAmbiguity(machineId: string, catalog: ConsoleCatalog): string[] {
  return catalog.links
    .filter((link) => link.machineIds.includes(machineId))
    .map((link) => linkAmbiguity(link, catalog))
    .filter((item): item is string => Boolean(item));
}
