import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { getConfig } from "../config";
import type { ConnectionStatus } from "../state/streamReducer";
import { AppNav } from "./AppNav";
import { BrandMark } from "./BrandMark";
import styles from "./Header.module.css";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  demo: "DEMO",
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING",
  offline: "OFFLINE",
  error: "ERROR",
};

interface Props {
  companyName: string;
  userName: string;
  role?: string | null;
  status: ConnectionStatus;
  statusDetail: string | null;
  demoMode?: boolean;
  showStreamStatus?: boolean;
  exampleLayout?: boolean;
  dataBadge?: string | null;
}

export function Header({
  companyName,
  userName,
  role,
  status,
  statusDetail,
  demoMode,
  showStreamStatus = true,
  exampleLayout = false,
  dataBadge = null,
}: Props) {
  const config = getConfig();
  return (
    <header className={styles.header}>
      <Link className={styles.brand} to="/" aria-label="FactoryPulse home">
        <BrandMark size="sm" />
        <div className={styles.company}>{companyName}</div>
      </Link>
      <AppNav />
      <div className={styles.meta}>
        {exampleLayout ? (
          <span
            className={`${styles.badge} ${styles.demoData}`}
            title="Local example floor and flow matrix. Not CSI locations or live machine state."
          >
            Example layout
          </span>
        ) : null}
        {dataBadge ? (
          <span
            className={`${styles.badge} ${styles.demoData}`}
            title="Console registry. Not live-cell CSI ingest and not measured RF isolation."
          >
            {dataBadge}
          </span>
        ) : null}
        {demoMode ? (
          <span className={`${styles.badge} ${styles.demoData}`} title="Local demo source. No live API or WebSocket.">
            Demo data
          </span>
        ) : null}
        {showStreamStatus ? (
          <span className={`${styles.badge} ${styles[status]}`} title={statusDetail ?? STATUS_LABEL[status]}>
            <span className={styles.dot} aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        ) : null}
        {config.authDisabled ? <span className={styles.badge}>Auth disabled (dev)</span> : null}
        <span className={styles.user}>
          {userName}
          {role ? ` · ${role}` : ""}
        </span>
        {!config.authDisabled ? <LogoutButton /> : null}
      </div>
    </header>
  );
}

function LogoutButton() {
  const { logout, isAuthenticated } = useAuth0();
  if (!isAuthenticated) {
    return null;
  }
  return (
    <button
      className={styles.logout}
      type="button"
      onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
    >
      Log out
    </button>
  );
}
