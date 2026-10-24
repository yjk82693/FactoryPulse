import { describe, expect, it } from "vitest";
import { SEED_TEMPLATES } from "./catalog";
import { generateSeries } from "./simulation";

describe("generateSeries", () => {
  it("is deterministic for a seed and labels expected vs observed", () => {
    const phases = SEED_TEMPLATES[0]!.phases;
    const a = generateSeries(phases, "normal", 7, 40);
    const b = generateSeries(phases, "normal", 7, 40);
    expect(a).toEqual(b);
    expect(a[0]?.expected).toBeGreaterThan(0);
    expect(a.every((point) => point.observed >= 0 && point.observed <= 1)).toBe(true);
  });

  it("keeps a short disturbance brief and drops missing motion", () => {
    const phases = SEED_TEMPLATES[0]!.phases;
    const short = generateSeries(phases, "short_disturbance", 3, 30);
    const missing = generateSeries(phases, "missing_motion", 3, 30);
    expect(short[19]!.observed).toBeGreaterThan(short[19]!.expected);
    expect(short[24]!.observed).toBeCloseTo(short[24]!.expected, 1);
    expect(missing[25]!.observed).toBeLessThan(missing[25]!.expected);
  });

  it("applies sustained deviation after the overlay starts", () => {
    const phases = SEED_TEMPLATES[0]!.phases;
    const normal = generateSeries(phases, "normal", 3, 30);
    const sustained = generateSeries(phases, "sustained_deviation", 3, 30);
    expect(sustained[20]!.observed).toBeGreaterThan(normal[20]!.observed);
  });
});
