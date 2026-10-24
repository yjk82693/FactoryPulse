import styles from "./VoiceButton.module.css";

interface Props {
  disabled: boolean;
  reason: string;
}

export function VoiceButton({ disabled, reason }: Props) {
  return (
    <button className={styles.button} type="button" disabled={disabled} title={reason}>
      Listen to Alert
    </button>
  );
}
