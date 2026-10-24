export interface GridPos {
  x: number;
  y: number;
}

export interface Workstation {
  id: string;
  name: string;
  kind: string;
}

export interface Slot {
  id: string;
  pos: GridPos;
}

export type Assignment = Record<string, string>;

export interface FlowEdge {
  from: string;
  to: string;
  frequency: number;
}

export interface LayoutScenario {
  id: string;
  label: string;
  grid: { width: number; height: number };
  stations: Workstation[];
  slots: Slot[];
  assignment: Assignment;
  flows: FlowEdge[];
}

export interface OptimizeResult {
  assignment: Assignment;
  baselineCost: number;
  optimizedCost: number;
  improvementAbs: number;
  improvementPct: number;
  improved: boolean;
}

export interface LayoutProvider {
  loadScenario(): Promise<LayoutScenario>;
}

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}
