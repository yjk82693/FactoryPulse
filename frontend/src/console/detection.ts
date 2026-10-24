import type { DetectorConfig, DetectorSnapshot, ReviewAlert } from "./types";

export const DEFAULT_DETECTOR: DetectorConfig = {
  scoreThreshold: 0.15,
  persistTicks: 6,
  recoverTicks: 4,
  hysteresis: 0.06,
};

export function initialDetector(): DetectorSnapshot {
  return {
    phase: "normal",
    pendingTicks: 0,
    recoverTicks: 0,
    score: 0,
    openAlertId: null,
  };
}

export function stepDetector(
  prev: DetectorSnapshot,
  score: number,
  tick: number,
  config: DetectorConfig,
  alerts: ReviewAlert[],
  machineId: string,
  nextId: () => string,
): { detector: DetectorSnapshot; alerts: ReviewAlert[] } {
  const enter = config.scoreThreshold;
  const leave = Math.max(0, config.scoreThreshold - config.hysteresis);
  let { phase, pendingTicks, recoverTicks, openAlertId } = prev;
  let nextAlerts = alerts;

  if (phase === "alert") {
    if (score <= leave) {
      recoverTicks += 1;
      if (recoverTicks >= config.recoverTicks) {
        if (openAlertId) {
          nextAlerts = alerts.map((item) =>
            item.id === openAlertId ? { ...item, clearedAtTick: tick } : item,
          );
        }
        return {
          detector: {
            phase: "normal",
            pendingTicks: 0,
            recoverTicks: 0,
            score,
            openAlertId: null,
          },
          alerts: nextAlerts,
        };
      }
    } else {
      recoverTicks = 0;
    }
    return {
      detector: { phase: "alert", pendingTicks: 0, recoverTicks, score, openAlertId },
      alerts: nextAlerts,
    };
  }

  if (score >= enter) {
    pendingTicks += 1;
    if (pendingTicks >= config.persistTicks) {
      if (!openAlertId) {
        const alert: ReviewAlert = {
          id: nextId(),
          machineId,
          openedAtTick: tick,
          clearedAtTick: null,
          score,
          message:
            "Sustained deviation from the synthetic baseline. Operator review recommended — not a confirmed machine fault.",
        };
        openAlertId = alert.id;
        nextAlerts = [alert, ...alerts];
      }
      return {
        detector: { phase: "alert", pendingTicks: 0, recoverTicks: 0, score, openAlertId },
        alerts: nextAlerts,
      };
    }
    return {
      detector: { phase: "pending", pendingTicks, recoverTicks: 0, score, openAlertId },
      alerts: nextAlerts,
    };
  }

  return {
    detector: { phase: "normal", pendingTicks: 0, recoverTicks: 0, score, openAlertId },
    alerts: nextAlerts,
  };
}
