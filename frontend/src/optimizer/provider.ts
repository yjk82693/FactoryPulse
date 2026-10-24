import { EXAMPLE_SCENARIO } from "./exampleScenario";
import type { LayoutProvider, LayoutScenario } from "./types";
import { cloneAssignment } from "./validate";

export class ExampleLayoutProvider implements LayoutProvider {
  async loadScenario(): Promise<LayoutScenario> {
    return {
      ...EXAMPLE_SCENARIO,
      stations: EXAMPLE_SCENARIO.stations.map((station) => ({ ...station })),
      slots: EXAMPLE_SCENARIO.slots.map((slot) => ({ ...slot, pos: { ...slot.pos } })),
      assignment: cloneAssignment(EXAMPLE_SCENARIO.assignment),
      flows: EXAMPLE_SCENARIO.flows.map((edge) => ({ ...edge })),
    };
  }
}
