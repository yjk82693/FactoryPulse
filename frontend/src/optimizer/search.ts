import type { Assignment, LayoutScenario, OptimizeResult } from "./types";
import { improvementPct, totalCost } from "./cost";
import { cloneAssignment, serializeAssignment, validateAssignment } from "./validate";

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const head = items[index] as T;
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    for (const tail of permute(rest)) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

export function optimizeLayout(
  scenario: LayoutScenario,
  currentAssignment: Assignment,
): OptimizeResult {
  validateAssignment(scenario, currentAssignment);
  const baselineCost = totalCost(scenario, currentAssignment);
  const stationIds = scenario.stations.map((station) => station.id).sort();
  const slotIds = scenario.slots.map((slot) => slot.id).sort();

  let bestAssignment = cloneAssignment(currentAssignment);
  let bestCost = baselineCost;
  let bestKey = serializeAssignment(bestAssignment);

  for (const permutation of permute(slotIds)) {
    const candidate: Assignment = {};
    stationIds.forEach((stationId, index) => {
      candidate[stationId] = permutation[index] as string;
    });
    const cost = totalCost(scenario, candidate);
    const key = serializeAssignment(candidate);
    if (cost < bestCost || (cost === bestCost && key < bestKey)) {
      bestCost = cost;
      bestKey = key;
      bestAssignment = candidate;
    }
  }

  const improved = bestCost < baselineCost;
  const assignment = improved ? bestAssignment : cloneAssignment(currentAssignment);
  const optimizedCost = improved ? bestCost : baselineCost;
  return {
    assignment,
    baselineCost,
    optimizedCost,
    improvementAbs: baselineCost - optimizedCost,
    improvementPct: improvementPct(baselineCost, optimizedCost),
    improved,
  };
}
