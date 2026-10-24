import { useEffect, useState } from "react";
import { EXPECTED_MS, STEPS, type MachineStatus, type Step } from "../types/contract";
import { elapsedMs } from "../lib/time";
import styles from "./WorkflowStepper.module.css";

interface Props {
  currentStep: Step | null;
  status: MachineStatus;
  stepStartedAt: string | null;
}

function phase(
  step: Step,
  current: Step | null,
  status: MachineStatus,
  delayed: boolean,
): "completed" | "active" | "pending" | "failed" | "delayed" {
  if (status === "FAULT" && current === step) {
    return "failed";
  }
  if (!current) {
    return "pending";
  }
  const currentIndex = STEPS.indexOf(current);
  const index = STEPS.indexOf(step);
  if (index < currentIndex) {
    return "completed";
  }
  if (index === currentIndex) {
    return delayed ? "delayed" : "active";
  }
  return "pending";
}

const PHASE_LABEL: Record<ReturnType<typeof phase>, string> = {
  completed: "Completed",
  active: "Active",
  pending: "Pending",
  failed: "Failed",
  delayed: "Delayed",
};

export function WorkflowStepper({ currentStep, status, stepStartedAt }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, []);

  const expected = currentStep ? EXPECTED_MS[currentStep] : null;
  const elapsed = elapsedMs(stepStartedAt);
  const delayed = expected !== null && elapsed !== null && elapsed > expected;

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className="panel-title">Workflow</div>
      <div className={styles.steps}>
        {STEPS.map((step) => {
          const kind = phase(step, currentStep, status, delayed && currentStep === step);
          return (
            <div key={step} className={`${styles.step} ${styles[kind]}`}>
              <div className={styles.name}>{step}</div>
              <div className={styles.phase}>
                {kind === "completed" ? <span aria-hidden="true">✓ </span> : null}
                {PHASE_LABEL[kind]}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
