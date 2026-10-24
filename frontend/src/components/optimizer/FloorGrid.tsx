import type { Assignment, FlowEdge, LayoutScenario, Workstation } from "../../optimizer/types";
import styles from "./FloorGrid.module.css";

interface Props {
  title: string;
  scenario: LayoutScenario;
  assignment: Assignment;
  selectedId: string | null;
  interactive: boolean;
  onSelect?: (stationId: string) => void;
}

function stationInSlot(scenario: LayoutScenario, assignment: Assignment, slotId: string): Workstation | null {
  const stationId = Object.keys(assignment).find((id) => assignment[id] === slotId);
  if (!stationId) {
    return null;
  }
  return scenario.stations.find((station) => station.id === stationId) ?? null;
}

function edgeTouches(edge: FlowEdge, stationId: string | null): boolean {
  if (!stationId) {
    return false;
  }
  return edge.from === stationId || edge.to === stationId;
}

export function FloorGrid({ title, scenario, assignment, selectedId, interactive, onSelect }: Props) {
  const slotMap = new Map(scenario.slots.map((slot) => [slot.id, slot]));
  const cells: Array<{ x: number; y: number; slotId: string | null; station: Workstation | null }> = [];
  for (let y = 0; y < scenario.grid.height; y += 1) {
    for (let x = 0; x < scenario.grid.width; x += 1) {
      const slot = scenario.slots.find((item) => item.pos.x === x && item.pos.y === y);
      cells.push({
        x,
        y,
        slotId: slot?.id ?? null,
        station: slot ? stationInSlot(scenario, assignment, slot.id) : null,
      });
    }
  }

  const maxFlow = Math.max(...scenario.flows.map((edge) => edge.frequency), 1);

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className="panel-title">{title}</div>
      <div
        className={styles.board}
        style={{
          gridTemplateColumns: `repeat(${scenario.grid.width}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${scenario.grid.height}, minmax(0, 1fr))`,
        }}
      >
        <svg
          className={styles.flows}
          viewBox={`0 0 ${scenario.grid.width} ${scenario.grid.height}`}
          aria-hidden="true"
        >
          {scenario.flows.map((edge) => {
            const fromSlot = slotMap.get(assignment[edge.from] ?? "");
            const toSlot = slotMap.get(assignment[edge.to] ?? "");
            if (!fromSlot || !toSlot || edge.frequency <= 0) {
              return null;
            }
            const active = edgeTouches(edge, selectedId);
            const dimmed = Boolean(selectedId) && !active;
            const width = 0.04 + (edge.frequency / maxFlow) * 0.1;
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={fromSlot.pos.x + 0.5}
                y1={fromSlot.pos.y + 0.5}
                x2={toSlot.pos.x + 0.5}
                y2={toSlot.pos.y + 0.5}
                stroke={active ? "#22d3ee" : "#6d7580"}
                strokeWidth={active ? width * 1.6 : width}
                strokeOpacity={dimmed ? 0.12 : active ? 0.95 : 0.28}
              />
            );
          })}
        </svg>
        {cells.map((cell) => {
          if (!cell.slotId) {
            return <div key={`${cell.x}-${cell.y}`} className={styles.empty} />;
          }
          const selected = cell.station?.id === selectedId;
          if (!cell.station) {
            return <div key={cell.slotId} className={styles.slot} />;
          }
          return interactive ? (
            <button
              key={cell.slotId}
              type="button"
              className={`${styles.slot} ${styles.filled} ${selected ? styles.selected : ""}`}
              onClick={() => onSelect?.(cell.station?.id ?? "")}
              aria-pressed={selected}
              aria-label={`${cell.station.name}, ${cell.station.kind}. Click to select or swap.`}
            >
              <span className={styles.name}>{cell.station.name}</span>
              <span className={styles.kind}>{cell.station.kind}</span>
            </button>
          ) : (
            <div
              key={cell.slotId}
              className={`${styles.slot} ${styles.filled} ${selected ? styles.selected : ""}`}
            >
              <span className={styles.name}>{cell.station.name}</span>
              <span className={styles.kind}>{cell.station.kind}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>
        {interactive
          ? selectedId
            ? "Click another workstation to swap positions."
            : "Click a workstation to select it. Connected flows are highlighted."
          : "Suggested assignment. Run Optimize Layout to refresh after changes."}
      </p>
    </section>
  );
}
