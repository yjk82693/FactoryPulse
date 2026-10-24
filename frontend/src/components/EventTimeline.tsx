import { useMemo, useState } from "react";
import type { Event, EventSourceKind } from "../types/contract";
import { localTime } from "../lib/time";
import styles from "./EventTimeline.module.css";

interface Props {
  events: Event[];
}

const PREVIEW = 6;

export function EventTimeline({ events }: Props) {
  const [source, setSource] = useState<EventSourceKind | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(
    () => (source === "all" ? events : events.filter((event) => event.source === source)),
    [events, source],
  );
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW);
  const hiddenCount = filtered.length - visible.length;

  return (
    <section className={`panel ${styles.wrap}`}>
      <div className={styles.head}>
        <div className="panel-title">Recent events</div>
        <select
          className={styles.select}
          value={source}
          onChange={(event) => setSource(event.target.value as EventSourceKind | "all")}
        >
          <option value="all">All sources</option>
          <option value="machine">Machine</option>
          <option value="sensor">Sensor</option>
          <option value="system">System</option>
        </select>
      </div>
      <div className={styles.list}>
        {visible.map((event) => (
          <div key={event.event_id} className={styles.row} title={`${event.timestamp} UTC`}>
            <span className={styles.time}>{localTime(event.timestamp)}</span>
            <span className={styles.source}>{event.source}</span>
            <span className={styles.type}>{event.event_type}</span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 || expanded ? (
        <button className={styles.more} type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </section>
  );
}
