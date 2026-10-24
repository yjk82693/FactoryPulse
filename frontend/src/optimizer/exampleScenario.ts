import type { LayoutScenario } from "./types";

/**
 * Six workstations on six valid slots. The initial assignment zigzags
 * high-flow pairs across the floor so exhaustive search can cluster the line.
 * Costs are never hardcoded in the UI; they come from totalCost().
 */
export const EXAMPLE_SCENARIO: LayoutScenario = {
  id: "example-cell-6",
  label: "Example assembly floor",
  grid: { width: 8, height: 5 },
  stations: [
    { id: "pick", name: "PICK", kind: "Material pickup" },
    { id: "move", name: "MOVE", kind: "Material transfer" },
    { id: "assemble", name: "ASSEMBLE", kind: "Product assembly" },
    { id: "inspect", name: "INSPECT", kind: "Quality inspection" },
    { id: "pack", name: "PACK", kind: "Packaging" },
    { id: "return", name: "RETURN", kind: "Return / storage" },
  ],
  slots: [
    { id: "nw", pos: { x: 0, y: 0 } },
    { id: "ne", pos: { x: 7, y: 0 } },
    { id: "sw", pos: { x: 0, y: 4 } },
    { id: "se", pos: { x: 7, y: 4 } },
    { id: "midL", pos: { x: 2, y: 2 } },
    { id: "midR", pos: { x: 5, y: 2 } },
  ],
  assignment: {
    pick: "nw",
    move: "se",
    assemble: "ne",
    inspect: "sw",
    pack: "midR",
    return: "midL",
  },
  flows: [
    { from: "pick", to: "move", frequency: 12 },
    { from: "move", to: "assemble", frequency: 12 },
    { from: "assemble", to: "inspect", frequency: 10 },
    { from: "inspect", to: "pack", frequency: 10 },
    { from: "pack", to: "return", frequency: 8 },
    { from: "return", to: "pick", frequency: 4 },
    { from: "move", to: "inspect", frequency: 2 },
    { from: "assemble", to: "pack", frequency: 1 },
  ],
};
