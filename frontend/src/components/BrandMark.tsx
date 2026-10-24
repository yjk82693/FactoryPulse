import styles from "./BrandMark.module.css";

interface Props {
  size?: "sm" | "md" | "lg";
  wordmark?: boolean;
}

export function BrandMark({ size = "md", wordmark = true }: Props) {
  return (
    <span className={`${styles.brand} ${styles[size]}`}>
      <svg className={styles.mark} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="1.5" y="1.5" width="37" height="37" rx="9" className={styles.frame} />
        <path
          d="M8 26 V18 L14 12 L20 18 V26 H8 Z"
          className={styles.plant}
        />
        <path d="M11 26 V22 H17 V26" className={styles.plant} />
        <path
          d="M20 22 C23 14, 25 30, 28 22 C30.5 16, 32 24, 34 20"
          className={styles.pulse}
        />
      </svg>
      {wordmark ? <span className={styles.word}>FactoryPulse</span> : null}
    </span>
  );
}
