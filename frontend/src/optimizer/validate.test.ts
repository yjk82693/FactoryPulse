import { describe, expect, it } from "vitest";
import { EXAMPLE_SCENARIO } from "./exampleScenario";
import { LayoutError } from "./types";
import { swapStations, validateAssignment } from "./validate";

describe("validateAssignment and swap", () => {
  it("accepts the example assignment", () => {
    expect(() => validateAssignment(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment)).not.toThrow();
  });

  it("rejects a missing workstation", () => {
    const { pick: _pick, ...rest } = EXAMPLE_SCENARIO.assignment;
    expect(() => validateAssignment(EXAMPLE_SCENARIO, rest)).toThrow(LayoutError);
  });

  it("swaps two stations without dropping others", () => {
    const next = swapStations(EXAMPLE_SCENARIO.assignment, "pick", "move");
    expect(next.pick).toBe(EXAMPLE_SCENARIO.assignment.move);
    expect(next.move).toBe(EXAMPLE_SCENARIO.assignment.pick);
    expect(next.assemble).toBe(EXAMPLE_SCENARIO.assignment.assemble);
    validateAssignment(EXAMPLE_SCENARIO, next);
  });
});
