import { describe, expect, it } from "vitest";
import { improvementPct, manhattan, totalCost } from "./cost";
import { LayoutError, type LayoutScenario } from "./types";

function miniScenario(): LayoutScenario {
  return {
    id: "mini",
    label: "mini",
    grid: { width: 4, height: 2 },
    stations: [
      { id: "a", name: "A", kind: "A" },
      { id: "b", name: "B", kind: "B" },
      { id: "c", name: "C", kind: "C" },
    ],
    slots: [
      { id: "s0", pos: { x: 0, y: 0 } },
      { id: "s1", pos: { x: 1, y: 0 } },
      { id: "s2", pos: { x: 3, y: 1 } },
    ],
    assignment: { a: "s0", b: "s1", c: "s2" },
    flows: [
      { from: "a", to: "b", frequency: 2 },
      { from: "b", to: "c", frequency: 3 },
    ],
  };
}

describe("manhattan and totalCost", () => {
  it("computes Manhattan distance", () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 7, y: 4 })).toBe(11);
  });

  it("matches a hand-computed weighted cost", () => {
    const scenario = miniScenario();
    // a-b: |0-1|+|0-0|=1 * 2 = 2
    // b-c: |1-3|+|0-1|=3 * 3 = 9
    expect(totalCost(scenario, scenario.assignment)).toBe(11);
  });

  it("ignores zero-frequency edges and returns 0 when all flows are zero", () => {
    const scenario = miniScenario();
    scenario.flows = [
      { from: "a", to: "b", frequency: 0 },
      { from: "b", to: "c", frequency: 0 },
    ];
    expect(totalCost(scenario, scenario.assignment)).toBe(0);
    expect(improvementPct(0, 0)).toBe(0);
  });

  it("rejects overlapping assignments", () => {
    const scenario = miniScenario();
    expect(() => totalCost(scenario, { a: "s0", b: "s0", c: "s2" })).toThrow(LayoutError);
  });

  it("rejects unknown flow endpoints", () => {
    const scenario = miniScenario();
    scenario.flows.push({ from: "a", to: "ghost", frequency: 1 });
    expect(() => totalCost(scenario, scenario.assignment)).toThrow(LayoutError);
  });
});
