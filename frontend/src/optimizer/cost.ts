import type { Assignment, GridPos, LayoutScenario, Slot } from "./types";
import { validateAssignment } from "./validate";

export function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function slotById(scenario: LayoutScenario, slotId: string): Slot {
  const slot = scenario.slots.find((item) => item.id === slotId);
  if (!slot) {
    throw new Error(`Unknown slot ${slotId}`);
  }
  return slot;
}

export function totalCost(scenario: LayoutScenario, assignment: Assignment): number {
  validateAssignment(scenario, assignment);
  let cost = 0;
  for (const edge of scenario.flows) {
    if (edge.frequency === 0) {
      continue;
    }
    const fromSlot = assignment[edge.from];
    const toSlot = assignment[edge.to];
    if (!fromSlot || !toSlot) {
      continue;
    }
    cost += edge.frequency * manhattan(slotById(scenario, fromSlot).pos, slotById(scenario, toSlot).pos);
  }
  return cost;
}

export function improvementPct(baselineCost: number, optimizedCost: number): number {
  if (baselineCost <= 0) {
    return 0;
  }
  return ((baselineCost - optimizedCost) / baselineCost) * 100;
}
