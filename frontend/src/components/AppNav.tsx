import { NavLink } from "react-router-dom";
import styles from "./AppNav.module.css";

export function AppNav() {
  return (
    <nav className={styles.nav} aria-label="FactoryPulse">
      <NavLink className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} to="/dashboard">
        Dashboard
      </NavLink>
      <NavLink className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)} to="/optimizer">
        Optimizer
      </NavLink>
    </nav>
  );
}
