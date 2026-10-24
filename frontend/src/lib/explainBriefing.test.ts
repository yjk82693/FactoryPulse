import { describe, expect, it } from "vitest";
import { makeAlert, makeEvent } from "../test/fixtures";
import { buildExplainBriefing, parseExplanationText } from "./explainBriefing";

describe("explain briefing", () => {
  it("keeps stored alert fields as observed facts, separate from model text", () => {
    const alert = makeAlert({ related_event_ids: ["22222222-2222-4222-8222-222222222222"] });
    const briefing = buildExplainBriefing(alert, "Possible nearby motion during ASSEMBLE.", {
      machineId: "assembly_01",
      currentStep: "ASSEMBLE",
      events: [makeEvent({ event_type: "ACTIVITY_DETECTED", source: "sensor" })],
    });
    expect(briefing.observedFacts.some((item) => item.includes("ACTIVITY_REVIEW"))).toBe(true);
    expect(briefing.observedFacts.some((item) => item.includes("assembly_01"))).toBe(true);
    expect(briefing.interpretations).toEqual(["Possible nearby motion during ASSEMBLE."]);
    expect(briefing.disclaimer).toMatch(/not a confirmed machine fault/i);
    expect(briefing.recommendedChecks.length).toBeGreaterThan(0);
  });

  it("parses optional JSON interpretations without treating them as faults", () => {
    expect(
      parseExplanationText(JSON.stringify({ interpretations: ["A", "B"] })),
    ).toEqual(["A", "B"]);
  });
});
