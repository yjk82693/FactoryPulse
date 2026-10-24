import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { getConfig } from "../../config";
import { useAccessToken } from "../../auth/useAccessToken";
import { useConsoleMeta } from "../../console/ConsoleContext";
import { Header } from "../Header";
import styles from "./ConsoleChrome.module.css";

export function ConsoleChrome({
  children,
  exampleLabel = "Synthetic console",
}: {
  children: ReactNode;
  exampleLabel?: string;
}) {
  const config = getConfig();
  const { userName } = useAccessToken();
  const meta = useConsoleMeta();
  const http = meta.source === "http";
  const badge = http ? "Live Console API" : "Synthetic console";
  return (
    <div className={styles.shell}>
      <Header
        companyName="Demo Manufacturing"
        userName={userName ?? (config.authDisabled ? "Demo Operator" : "—")}
        status="demo"
        statusDetail={null}
        showStreamStatus={false}
        dataBadge={badge}
      />
      <p className={styles.banner}>
        {http
          ? `${exampleLabel}. Live Console HTTP — not CSI measurements, not live-cell ingest, and not a confirmed machine fault system.`
          : `${exampleLabel}. Mock services only — not CSI measurements, not Contract v1.3 live ingest, and not a confirmed machine fault system.`}
      </p>
      {meta.loading ? <p className={styles.banner}>Loading Console catalog…</p> : null}
      {meta.error ? <p className={styles.banner}>{meta.error} Last known catalog is shown if one loaded; mocks are not substituted.</p> : null}
      {children}
      <p className="disclaimer">
        Prototype only. Wi-Fi CSI observes radio-channel change. Machine scores are hypotheses. Dedicated links
        do not perfectly isolate a machine.
      </p>
    </div>
  );
}

export function OptimizerSubnav() {
  return (
    <nav className={styles.sub} aria-label="Optimizer modes">
      <NavLink
        className={({ isActive }) => (isActive ? `${styles.subLink} ${styles.subActive}` : styles.subLink)}
        to="/optimizer"
        end
      >
        Layout
      </NavLink>
      <NavLink
        className={({ isActive }) => (isActive ? `${styles.subLink} ${styles.subActive}` : styles.subLink)}
        to="/optimizer/sensors"
      >
        Sensor placement
      </NavLink>
    </nav>
  );
}
