import { describe, expect, it } from "vitest";
import { DEFAULT_DETECTOR, initialDetector, stepDetector } from "./detection";
import type { DetectorSnapshot, ReviewAlert } from "./types";

function run(scores: number[]): { detector: DetectorSnapshot; alerts: ReviewAlert[] } {
  let detector = initialDetector();
  let alerts: ReviewAlert[] = [];
  let n = 0;
  scores.forEach((score, tick) => {
    const stepped = stepDetector(detector, score, tick, DEFAULT_DETECTOR, alerts, "mch-press-01", () => {
      n += 1;
      return `al-${n}`;
    });
    detector = stepped.detector;
    alerts = stepped.alerts;
  });
  return { detector, alerts };
}

describe("stepDetector", () => {
  it("ignores a short spike below persistence", () => {
    const scores = [0, 0, 0.5, 0.5, 0, 0, 0];
    const { detector, alerts } = run(scores);
    expect(alerts).toHaveLength(0);
    expect(detector.phase).toBe("normal");
  });

  it("opens one review alert for a sustained deviation and does not duplicate it", () => {
    const scores = Array.from({ length: 20 }, () => 0.5);
    const { detector, alerts } = run(scores);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.clearedAtTick).toBeNull();
    expect(detector.phase).toBe("alert");
    expect(alerts[0]?.message).toMatch(/not a confirmed machine fault/i);
  });

  it("does not open an alert until persistTicks consecutive scores", () => {
    const scores = Array.from({ length: DEFAULT_DETECTOR.persistTicks - 1 }, () => 0.5);
    const { detector, alerts } = run(scores);
    expect(alerts).toHaveLength(0);
    expect(detector.phase).toBe("pending");
    expect(detector.pendingTicks).toBe(DEFAULT_DETECTOR.persistTicks - 1);
  });

  it("keeps an open alert when the score sits in the hysteresis band", () => {
    const high = Array.from({ length: 8 }, () => 0.5);
    const band = Array.from({ length: 6 }, () => 0.12);
    const { detector, alerts } = run([...high, ...band]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.clearedAtTick).toBeNull();
    expect(detector.phase).toBe("alert");
  });

  it("clears after hysteresis recovery and can alert again later", () => {
    const high = Array.from({ length: 8 }, () => 0.5);
    const low = Array.from({ length: 8 }, () => 0.02);
    const again = Array.from({ length: 8 }, () => 0.5);
    const { alerts } = run([...high, ...low, ...again]);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]?.clearedAtTick).not.toBeNull();
    expect(alerts[0]?.clearedAtTick).toBeNull();
  });
});
