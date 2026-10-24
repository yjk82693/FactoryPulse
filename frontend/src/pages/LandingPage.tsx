import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import styles from "./LandingPage.module.css";

const FEATURES = [
  {
    title: "Wi-Fi Motion Sensing",
    body: "Activity scores from Wi-Fi Channel State Information provide contextual observations near the cell. This is operational context, not certified safety monitoring or person identification.",
  },
  {
    title: "Machine Cycle Intelligence",
    body: "Follow the simulated assembly workflow PICK → MOVE → ASSEMBLE → RETURN with live step timing against expected durations.",
  },
  {
    title: "Real-Time Operational Alerts",
    body: "Context-aware review alerts surface when activity coincides with ASSEMBLE, or when a step is delayed or fails. Alerts are observations for operator review.",
  },
];

export function LandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <header className={styles.top}>
        <BrandMark size="md" />
        <nav className={styles.nav}>
          <Link to="/login">Sign in</Link>
          <Link className={styles.ghost} to="/dashboard">
            Demo
          </Link>
        </nav>
      </header>
      <main className={styles.hero}>
        <p className={styles.kicker}>Assembly cell intelligence</p>
        <h1 className={styles.headline}>See Every Motion. Understand Every Cycle.</h1>
        <p className={styles.sub}>
          Real-time operational intelligence powered by Wi-Fi sensing, machine workflow analytics, and
          anomaly detection.
        </p>
        <div className={styles.ctas}>
          <Link className={styles.primary} to="/login">
            Get Started
          </Link>
          <Link className={styles.secondary} to="/dashboard">
            Explore Demo
          </Link>
        </div>
      </main>
      <section className={styles.features}>
        {FEATURES.map((feature) => (
          <article key={feature.title} className={styles.card}>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>
      <footer className={styles.foot}>
        Prototype for demonstration. The assembly machine is simulated. Wi-Fi CSI activity is not a
        certified safety system.
      </footer>
    </div>
  );
}
