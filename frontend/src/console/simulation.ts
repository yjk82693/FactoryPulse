import { mulberry32 } from "./rng";
import type { ActivityPoint, PhaseTemplate, SimScenario } from "./types";

export function expectedFromPhases(phases: PhaseTemplate[], tick: number): number {
  const cycle = phases.reduce((sum, phase) => sum + phase.durationTicks, 0);
  if (cycle <= 0) {
    return 0;
  }
  let offset = ((tick % cycle) + cycle) % cycle;
  for (const phase of phases) {
    if (offset < phase.durationTicks) {
      return phase.expectedActivity;
    }
    offset -= phase.durationTicks;
  }
  return phases[phases.length - 1]?.expectedActivity ?? 0;
}

export function generateSeries(
  phases: PhaseTemplate[],
  scenario: SimScenario,
  seed: number,
  length: number,
): ActivityPoint[] {
  const rand = mulberry32(seed);
  const points: ActivityPoint[] = [];
  for (let t = 0; t < length; t += 1) {
    const expected = expectedFromPhases(phases, t);
    let observed = expected + (rand() - 0.5) * 0.06;
    if (scenario === "short_disturbance" && t >= 18 && t < 22) {
      observed = Math.min(1, expected + 0.45);
    } else if (scenario === "sustained_deviation" && t >= 16) {
      observed = Math.min(1, expected + 0.35);
    } else if (scenario === "missing_motion" && t >= 20) {
      observed = Math.max(0, expected * 0.12 + (rand() - 0.5) * 0.02);
    }
    points.push({
      t,
      expected: Number(expected.toFixed(3)),
      observed: Number(Math.min(1, Math.max(0, observed)).toFixed(3)),
    });
  }
  return points;
}

export function anomalyScore(expected: number, observed: number): number {
  return Number(Math.min(1, Math.abs(observed - expected)).toFixed(3));
}
