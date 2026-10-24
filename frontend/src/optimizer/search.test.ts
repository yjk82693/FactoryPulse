import { describe, expect, it } from "vitest";
import { totalCost } from "./cost";
import { EXAMPLE_SCENARIO } from "./exampleScenario";
import { optimizeLayout } from "./search";
import type { Assignment, LayoutScenario } from "./types";
import { serializeAssignment } from "./validate";

function miniScenario(): LayoutScenario {
  return {
    id: "mini",
    label: "mini",
    grid: { width: 3, height: 1 },
    stations: [
      { id: "a", name: "A", kind: "A" },
      { id: "b", name: "B", kind: "B" },
      { id: "c", name: "C", kind: "C" },
    ],
    slots: [
      { id: "left", pos: { x: 0, y: 0 } },
      { id: "mid", pos: { x: 1, y: 0 } },
      { id: "right", pos: { x: 2, y: 0 } },
    ],
    assignment: { a: "left", b: "right", c: "mid" },
    flows: [
      { from: "a", to: "b", frequency: 5 },
      { from: "b", to: "c", frequency: 5 },
    ],
  };
}

describe("optimizeLayout", () => {
  it("finds the unique obvious optimum on a 3-station line", () => {
    const scenario = miniScenario();
    const result = optimizeLayout(scenario, scenario.assignment);
    expect(result.improved).toBe(true);
    expect(result.optimizedCost).toBeLessThan(result.baselineCost);
    expect(result.optimizedCost).toBe(totalCost(scenario, result.assignment));
    // Best path is a-b-c or c-b-a adjacent: cost 5*1 + 5*1 = 10
    expect(result.optimizedCost).toBe(10);
    const used = new Set(Object.values(result.assignment));
    expect(used.size).toBe(3);
    expect(Object.keys(result.assignment).sort()).toEqual(["a", "b", "c"]);
  });

  it("never returns a cost above the baseline", () => {
    const result = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    expect(result.optimizedCost).toBeLessThanOrEqual(result.baselineCost);
    expect(result.improvementAbs).toBe(result.baselineCost - result.optimizedCost);
  });

  it("produces a meaningful improvement on the example scenario", () => {
    const result = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    expect(result.improved).toBe(true);
    expect(result.improvementPct).toBeGreaterThan(25);
    expect(result.baselineCost).toBe(totalCost(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment));
    expect(result.optimizedCost).toBe(totalCost(EXAMPLE_SCENARIO, result.assignment));
  });

  it("returns the current layout when it is already optimal", () => {
    const first = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    const again = optimizeLayout(EXAMPLE_SCENARIO, first.assignment);
    expect(again.improved).toBe(false);
    expect(again.optimizedCost).toBe(first.optimizedCost);
    expect(serializeAssignment(again.assignment)).toBe(serializeAssignment(first.assignment));
  });

  it("is deterministic across repeated runs", () => {
    const a = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    const b = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    expect(serializeAssignment(a.assignment)).toBe(serializeAssignment(b.assignment));
    expect(a.optimizedCost).toBe(b.optimizedCost);
  });

  it("breaks cost ties with lexicographic assignment order", () => {
    const scenario: LayoutScenario = {
      id: "tie",
      label: "tie",
      grid: { width: 2, height: 1 },
      stations: [
        { id: "a", name: "A", kind: "A" },
        { id: "b", name: "B", kind: "B" },
      ],
      slots: [
        { id: "p", pos: { x: 0, y: 0 } },
        { id: "q", pos: { x: 1, y: 0 } },
      ],
      assignment: { a: "q", b: "p" },
      flows: [],
    };
    const result = optimizeLayout(scenario, scenario.assignment);
    expect(result.optimizedCost).toBe(0);
    expect(result.improved).toBe(false);
    expect(result.assignment).toEqual({ a: "q", b: "p" });
  });

  it("keeps a bijection of stations to slots", () => {
    const result = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    const assignment: Assignment = result.assignment;
    expect(new Set(Object.keys(assignment)).size).toBe(6);
    expect(new Set(Object.values(assignment)).size).toBe(6);
  });
});
