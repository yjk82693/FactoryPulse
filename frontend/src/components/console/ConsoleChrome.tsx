import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { getConfig } from "../../config";
import { useAccessToken } from "../../auth/useAccessToken";
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
  return (
    <div className={styles.shell}>
      <Header
        companyName="Demo Manufacturing"
        userName={userName ?? (config.authDisabled ? "Demo Operator" : "—")}
        status="demo"
        statusDetail={null}
        showStreamStatus={false}
        dataBadge="Synthetic console"
      />
      <p className={styles.banner}>
        {exampleLabel}. Mock services only — not CSI measurements, not Contract v1.2 live ingest, and not a
        confirmed machine fault system.
      </p>
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
