import { useCallback, useState } from "react";

export type VoiceStatus = "idle" | "loading" | "playing" | "stopped" | "error";

/** P2 playback hook. P0 keeps the button disabled and never fetches audio. */
export function useAlertVoice() {
  const [status] = useState<VoiceStatus>("idle");
  const play = useCallback((_alertId: string) => {
    /* P2 */
  }, []);
  const stop = useCallback(() => {
    /* P2 */
  }, []);
  return { status, play, stop, error: null as string | null };
}
