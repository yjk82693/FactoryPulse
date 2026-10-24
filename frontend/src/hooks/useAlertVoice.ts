import { useCallback, useEffect, useReducer } from "react";
import { ApiClientError } from "../services/api";

export type VoiceStatus = "idle" | "loading" | "playing" | "paused" | "stopped" | "error";

export interface VoiceEntry {
  status: VoiceStatus;
  error: string | null;
  disabledReason: string | null;
}

type FetchVoice = (alertId: string) => Promise<Blob>;

const urls = new Map<string, string>();
const entries = new Map<string, VoiceEntry>();
const listeners = new Map<string, Set<() => void>>();
let audio: HTMLAudioElement | null = null;
let loadingId: string | null = null;
let playingId: string | null = null;

function emptyEntry(): VoiceEntry {
  return { status: "idle", error: null, disabledReason: null };
}

function getEntry(alertId: string): VoiceEntry {
  return entries.get(alertId) ?? emptyEntry();
}

function emit(alertId: string): void {
  listeners.get(alertId)?.forEach((listener) => listener());
}

function setEntry(alertId: string, patch: Partial<VoiceEntry>): void {
  entries.set(alertId, { ...getEntry(alertId), ...patch });
  emit(alertId);
}

export function mapVoiceError(error: unknown): { message: string; disable: boolean } {
  if (error instanceof ApiClientError) {
    if (error.status === 501 || (error.status === 404 && error.code !== "alert_not_found")) {
      return { message: "Voice alerts not configured on server", disable: true };
    }
    if (error.status === 404) {
      return { message: "Alert no longer available", disable: false };
    }
    if (error.status === 502 || error.status === 504) {
      return { message: "Voice service unavailable, try again", disable: false };
    }
    if (error.status === 401 || error.status === 403) {
      return { message: error.detail, disable: false };
    }
  }
  return { message: "Voice service unavailable, try again", disable: false };
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", () => {
      if (playingId) {
        const id = playingId;
        playingId = null;
        setEntry(id, { status: "stopped" });
      }
    });
  }
  return audio;
}

function pauseCurrent(nextStatus: VoiceStatus = "paused"): void {
  audio?.pause();
  if (playingId) {
    setEntry(playingId, { status: nextStatus });
    playingId = null;
  }
}

async function startAudio(alertId: string, url: string): Promise<void> {
  if (playingId && playingId !== alertId) {
    pauseCurrent("stopped");
  }
  const element = ensureAudio();
  element.src = url;
  playingId = alertId;
  setEntry(alertId, { status: "playing", error: null });
  try {
    await element.play();
  } catch {
    playingId = null;
    setEntry(alertId, { status: "error", error: "Voice service unavailable, try again" });
  }
}

export async function playAlert(alertId: string, fetchVoice: FetchVoice): Promise<void> {
  if (loadingId === alertId) {
    return;
  }
  if (playingId && playingId !== alertId) {
    pauseCurrent("stopped");
  }
  const existing = getEntry(alertId);
  const cached = urls.get(alertId);
  if (existing.status === "paused" && cached && audio) {
    playingId = alertId;
    setEntry(alertId, { status: "playing", error: null });
    try {
      await audio.play();
    } catch {
      playingId = null;
      setEntry(alertId, { status: "error", error: "Voice service unavailable, try again" });
    }
    return;
  }
  if (cached) {
    await startAudio(alertId, cached);
    return;
  }
  loadingId = alertId;
  setEntry(alertId, { status: "loading", error: null });
  try {
    const blob = await fetchVoice(alertId);
    if (loadingId !== alertId) {
      return;
    }
    const type = blob.type.split(";")[0]?.trim() ?? "";
    if (type !== "audio/mpeg") {
      throw new ApiClientError("Voice service unavailable, try again", "voice_upstream_error", 502);
    }
    const url = URL.createObjectURL(blob);
    urls.set(alertId, url);
    loadingId = null;
    await startAudio(alertId, url);
  } catch (error) {
    if (loadingId !== alertId) {
      return;
    }
    loadingId = null;
    const mapped = mapVoiceError(error);
    setEntry(alertId, {
      status: "error",
      error: mapped.message,
      disabledReason: mapped.disable ? mapped.message : null,
    });
  }
}

export function pauseAlert(alertId: string): void {
  if (playingId === alertId) {
    pauseCurrent("paused");
  }
}

export function stopAlert(alertId: string): void {
  if (loadingId === alertId) {
    loadingId = null;
    setEntry(alertId, { status: "stopped" });
  }
  if (playingId === alertId || getEntry(alertId).status === "paused") {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (playingId === alertId) {
      playingId = null;
    }
    setEntry(alertId, { status: "stopped" });
  }
}

export function disposeAlert(alertId: string): void {
  stopAlert(alertId);
  const url = urls.get(alertId);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(alertId);
  }
  entries.delete(alertId);
}

export function resetVoiceForTests(): void {
  audio?.pause();
  audio = null;
  playingId = null;
  loadingId = null;
  for (const url of urls.values()) {
    URL.revokeObjectURL(url);
  }
  urls.clear();
  entries.clear();
  listeners.clear();
}

export function useAlertVoice(alertId: string, fetchVoice: FetchVoice | null) {
  const [, rerender] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    let set = listeners.get(alertId);
    if (!set) {
      set = new Set();
      listeners.set(alertId, set);
    }
    set.add(rerender);
    return () => {
      set.delete(rerender);
      disposeAlert(alertId);
    };
  }, [alertId]);

  const entry = getEntry(alertId);

  const play = useCallback(() => {
    if (!fetchVoice || getEntry(alertId).status === "loading") {
      return;
    }
    void playAlert(alertId, fetchVoice);
  }, [alertId, fetchVoice]);

  const pause = useCallback(() => {
    pauseAlert(alertId);
  }, [alertId]);

  const stop = useCallback(() => {
    stopAlert(alertId);
  }, [alertId]);

  return {
    status: entry.status,
    error: entry.error,
    disabledReason: entry.disabledReason,
    play,
    pause,
    stop,
  };
}
