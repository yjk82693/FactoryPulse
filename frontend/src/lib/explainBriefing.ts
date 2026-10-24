import type { Alert, Event, Step } from "../types/contract";

export interface ExplainBriefing {
  observedFacts: string[];
  interpretations: string[];
  recommendedChecks: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an operational observation for review. It is not a confirmed machine fault, safety incident, identity, or location.";

function relatedFacts(alert: Alert, events: Event[]): string[] {
  const related = events.filter((event) => alert.related_event_ids.includes(event.event_id));
  return related.map((event) => `${event.event_type} at ${event.timestamp} (${event.source})`);
}

export function observedFactsFromAlert(
  alert: Alert,
  context: { machineId?: string | null; currentStep?: Step | null; events?: Event[] },
): string[] {
  const facts = [
    `Rule ${alert.rule}, severity ${alert.severity}, cycle ${alert.cycle_id}.`,
    `Stored message: ${alert.message}`,
  ];
  if (context.machineId) {
    facts.push(`Live cell id ${context.machineId}.`);
  }
  if (context.currentStep) {
    facts.push(`Current step reported as ${context.currentStep}.`);
  }
  facts.push(...relatedFacts(alert, context.events ?? []));
  return facts;
}

export function recommendedChecks(rule: Alert["rule"]): string[] {
  if (rule === "ACTIVITY_REVIEW" || rule === "ACTIVITY_INFO") {
    return [
      "Confirm whether motion near the cell is expected for this step.",
      "Check that the CSI ingest path is connected (not a stale sample).",
      "Do not treat this as a confirmed mechanical failure.",
    ];
  }
  if (rule === "STEP_DELAY") {
    return ["Compare step duration to the expected cycle time.", "Look for blocking material or operator delay."];
  }
  return ["Review the related events on the timeline.", "Escalate only after operator confirmation."];
}

export function parseExplanationText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const interpretations = record.interpretations ?? record.possible_interpretations ?? record.explanation;
      if (Array.isArray(interpretations)) {
        return interpretations.filter((item): item is string => typeof item === "string" && item.length > 0);
      }
      if (typeof interpretations === "string" && interpretations.length > 0) {
        return [interpretations];
      }
    }
  } catch {
    /* Plain text from Gemini. */
  }
  return [trimmed];
}

export function buildExplainBriefing(
  alert: Alert,
  explanation: string | null,
  context: { machineId?: string | null; currentStep?: Step | null; events?: Event[] },
): ExplainBriefing {
  return {
    observedFacts: observedFactsFromAlert(alert, context),
    interpretations: explanation
      ? parseExplanationText(explanation)
      : ["No model explanation yet. Facts above are from stored alert fields only."],
    recommendedChecks: recommendedChecks(alert.rule),
    disclaimer: DISCLAIMER,
  };
}
