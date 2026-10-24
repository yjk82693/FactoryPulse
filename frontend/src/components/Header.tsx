import { useAuth0 } from "@auth0/auth0-react";
import { getConfig } from "../config";
import type { ConnectionStatus } from "../state/streamReducer";
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
  status: ConnectionStatus;
  statusDetail: string | null;
}

export function Header({ companyName, userName, status, statusDetail }: Props) {
  const config = getConfig();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.title}>FactoryPulse</div>
        <div className={styles.company}>{companyName}</div>
      </div>
      <div className={styles.meta}>
        <span className={`${styles.badge} ${styles[status]}`} title={statusDetail ?? STATUS_LABEL[status]}>
          <span className={styles.dot} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
        {config.authDisabled ? <span className={styles.badge}>Auth disabled (dev)</span> : null}
        <span className={styles.user}>{userName}</span>
        {!config.authDisabled ? <LogoutButton /> : null}
      </div>
    </header>
  );
}

function LogoutButton() {
  const { logout } = useAuth0();
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
