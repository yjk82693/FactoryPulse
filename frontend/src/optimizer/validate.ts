import type { Assignment, LayoutScenario } from "./types";
import { LayoutError } from "./types";

export function cloneAssignment(assignment: Assignment): Assignment {
  return { ...assignment };
}

export function serializeAssignment(assignment: Assignment): string {
  return Object.keys(assignment)
    .sort()
    .map((stationId) => `${stationId}:${assignment[stationId] ?? ""}`)
    .join("|");
}

export function assignmentsEqual(left: Assignment, right: Assignment): boolean {
  return serializeAssignment(left) === serializeAssignment(right);
}

export function validateScenario(scenario: LayoutScenario): void {
  if (scenario.stations.length === 0) {
    throw new LayoutError("Scenario has no workstations.");
  }
  if (scenario.stations.length !== scenario.slots.length) {
    throw new LayoutError("Workstation count must equal slot count.");
  }
  const stationIds = new Set<string>();
  for (const station of scenario.stations) {
    if (stationIds.has(station.id)) {
      throw new LayoutError(`Duplicate workstation id: ${station.id}`);
    }
    stationIds.add(station.id);
  }
  const slotIds = new Set<string>();
  const occupied = new Set<string>();
  for (const slot of scenario.slots) {
    if (slotIds.has(slot.id)) {
      throw new LayoutError(`Duplicate slot id: ${slot.id}`);
    }
    slotIds.add(slot.id);
    if (
      slot.pos.x < 0 ||
      slot.pos.y < 0 ||
      slot.pos.x >= scenario.grid.width ||
      slot.pos.y >= scenario.grid.height
    ) {
      throw new LayoutError(`Slot ${slot.id} is outside the floor grid.`);
    }
    const key = `${slot.pos.x},${slot.pos.y}`;
    if (occupied.has(key)) {
      throw new LayoutError(`Overlapping slots at ${key}.`);
    }
    occupied.add(key);
  }
  for (const edge of scenario.flows) {
    if (!stationIds.has(edge.from) || !stationIds.has(edge.to)) {
      throw new LayoutError(`Flow references unknown workstation: ${edge.from} → ${edge.to}`);
    }
    if (!Number.isFinite(edge.frequency) || edge.frequency < 0) {
      throw new LayoutError("Flow frequency must be a finite number ≥ 0.");
    }
  }
}

export function validateAssignment(scenario: LayoutScenario, assignment: Assignment): void {
  validateScenario(scenario);
  const stationIds = scenario.stations.map((station) => station.id);
  const slotIds = new Set(scenario.slots.map((slot) => slot.id));
  const usedSlots = new Set<string>();
  for (const stationId of stationIds) {
    const slotId = assignment[stationId];
    if (!slotId) {
      throw new LayoutError(`Missing assignment for workstation ${stationId}.`);
    }
    if (!slotIds.has(slotId)) {
      throw new LayoutError(`Unknown slot ${slotId} assigned to ${stationId}.`);
    }
    if (usedSlots.has(slotId)) {
      throw new LayoutError(`Slot ${slotId} is assigned more than once.`);
    }
    usedSlots.add(slotId);
  }
  if (Object.keys(assignment).some((id) => !stationIds.includes(id))) {
    throw new LayoutError("Assignment includes an unknown workstation.");
  }
}

export function swapStations(assignment: Assignment, leftId: string, rightId: string): Assignment {
  const leftSlot = assignment[leftId];
  const rightSlot = assignment[rightId];
  if (!leftSlot || !rightSlot) {
    throw new LayoutError("Cannot swap unassigned workstations.");
  }
  return {
    ...assignment,
    [leftId]: rightSlot,
    [rightId]: leftSlot,
  };
}
