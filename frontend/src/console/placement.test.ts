import { describe, expect, it } from "vitest";
import { seedCatalog } from "./catalog";
import { evaluatePlacement, recommendPlacement } from "./placement";

describe("sensor placement strategies", () => {
  it("compares dedicated, shared, and mixed under labeled assumptions", () => {
    const strategies = evaluatePlacement(seedCatalog());
    expect(strategies.map((item) => item.id)).toEqual(["dedicated", "shared_zone", "mixed"]);
    const dedicated = strategies.find((item) => item.id === "dedicated")!;
    const shared = strategies.find((item) => item.id === "shared_zone")!;
    expect(dedicated.hardwareCost).toBeGreaterThan(shared.hardwareCost);
    expect(shared.ambiguity).toBeGreaterThan(dedicated.ambiguity);
    const rec = recommendPlacement(strategies);
    expect(rec.id).toBeDefined();
  });
});
