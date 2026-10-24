import { describe, expect, it } from "vitest";
import { DEFAULT_DETECTOR, initialDetector, stepDetector } from "./detection";
import { evaluatePlacement, recommendPlacement } from "./placement";
import { generateSeries } from "./simulation";
import { MemoryConsoleStore } from "./store";
import type { ReviewAlert } from "./types";

function detect(scores: number[]) {
  let detector = initialDetector();
  let alerts: ReviewAlert[] = [];
  let n = 0;
  scores.forEach((score, tick) => {
    const stepped = stepDetector(detector, score, tick, DEFAULT_DETECTOR, alerts, "mch", () => {
      n += 1;
      return `al-${n}`;
    });
    detector = stepped.detector;
    alerts = stepped.alerts;
  });
  return { detector, alerts };
}

describe("console mock workflow", () => {
  it("creates a machine, assigns a sensor, and calibrates a new profile in one store", () => {
    const store = new MemoryConsoleStore();
    const machine = store.createMachine({
      name: "Press-99",
      kind: "press",
      zoneId: "zone-a",
      status: "IDLE",
      profileId: "prf-press-1",
    });
    const link = store.upsertLink({
      name: "Dedicated Press-99",
      mode: "dedicated",
      zoneId: "zone-a",
      machineIds: [machine.id],
    });
    const profile = store.createProfileFromTemplate("tpl-press", "Press — line 2");
    store.updateMachine(machine.id, { profileId: profile.id });
    store.setCalibration(profile.id, machine.id, "calibrating");
    store.setCalibration(profile.id, machine.id, "calibrated");
    const snapshot = store.getSnapshot();
    expect(snapshot.selectedMachineId).toBe(machine.id);
    expect(snapshot.machines.find((item) => item.id === machine.id)?.sensorLinkIds).toContain(link.id);
    expect(snapshot.profiles.find((item) => item.id === profile.id)?.calibrations[0]?.state).toBe("calibrated");
  });

  it("treats normal and short disturbance as non-alerting, and sustained as one review alert", () => {
    const store = new MemoryConsoleStore();
    const phases = store.getSnapshot().profiles[0]!.phases;
    const run = (scenario: "normal" | "short_disturbance" | "sustained_deviation") => {
      const series = generateSeries(phases, scenario, 7, 48);
      return detect(series.map((point) => Math.abs(point.observed - point.expected)));
    };
    expect(run("normal").alerts).toHaveLength(0);
    expect(run("short_disturbance").alerts).toHaveLength(0);
    const sustained = run("sustained_deviation");
    expect(sustained.alerts).toHaveLength(1);
    expect(sustained.alerts[0]?.message).toMatch(/not a confirmed machine fault/i);
  });

  it("recommends among dedicated, shared-zone, and mixed placement scores", () => {
    const strategies = evaluatePlacement(new MemoryConsoleStore().getSnapshot());
    expect(strategies.map((item) => item.id)).toEqual(["dedicated", "shared_zone", "mixed"]);
    expect(recommendPlacement(strategies).id).toBeTruthy();
    expect(strategies.find((item) => item.id === "dedicated")!.hardwareCost).toBeGreaterThan(
      strategies.find((item) => item.id === "shared_zone")!.hardwareCost,
    );
  });
});
