import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetVoiceForTests, useAlertVoice } from "./useAlertVoice";
import { ApiClientError } from "../services/api";

class FakeAudio {
  src = "";
  paused = true;
  currentTime = 0;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  addEventListener = vi.fn();
}

afterEach(() => {
  resetVoiceForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMedia() {
  const createObjectURL = vi.fn(() => "blob:alert-audio");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", {
    createObjectURL,
    revokeObjectURL,
  });
  return { createObjectURL, revokeObjectURL };
}

describe("useAlertVoice", () => {
  it("makes no request in Demo Mode when fetchVoice is null", () => {
    const fetchVoice = vi.fn();
    const { result } = renderHook(() => useAlertVoice("alert-1", null));
    act(() => {
      result.current.play();
    });
    expect(fetchVoice).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("shows disabled state on 501", async () => {
    stubMedia();
    const fetchVoice = vi.fn(async () => {
      throw new ApiClientError("unset", "voice_not_configured", 501);
    });
    const { result } = renderHook(() => useAlertVoice("alert-1", fetchVoice));
    await act(async () => {
      result.current.play();
      await Promise.resolve();
    });
    expect(result.current.disabledReason).toBe("Voice alerts not configured on server");
    expect(result.current.status).toBe("error");
  });

  it("surfaces ElevenLabs 502 detail", async () => {
    stubMedia();
    const fetchVoice = vi.fn(async () => {
      throw new ApiClientError(
        "ElevenLabs plan does not allow this voice via the API",
        "voice_upstream_error",
        502,
      );
    });
    const { result } = renderHook(() => useAlertVoice("alert-1", fetchVoice));
    await act(async () => {
      result.current.play();
      await Promise.resolve();
    });
    expect(result.current.error).toBe("ElevenLabs plan does not allow this voice via the API");
    expect(result.current.disabledReason).toBeNull();
  });

  it("blocks a second request while loading", async () => {
    stubMedia();
    let resolve!: (blob: Blob) => void;
    const fetchVoice = vi.fn(
      () =>
        new Promise<Blob>((next) => {
          resolve = next;
        }),
    );
    const { result } = renderHook(() => useAlertVoice("alert-1", fetchVoice));
    act(() => {
      result.current.play();
    });
    act(() => {
      result.current.play();
    });
    expect(fetchVoice).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("loading");
    await act(async () => {
      resolve(new Blob(["mp3"], { type: "audio/mpeg" }));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("revokes the object URL on unmount", async () => {
    const { createObjectURL, revokeObjectURL } = stubMedia();
    const fetchVoice = vi.fn(async () => new Blob(["mp3"], { type: "audio/mpeg" }));
    const { result, unmount } = renderHook(() => useAlertVoice("alert-1", fetchVoice));
    await act(async () => {
      result.current.play();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(createObjectURL).toHaveBeenCalled();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:alert-audio");
  });

  it("replays from the cached object URL without refetching", async () => {
    stubMedia();
    const fetchVoice = vi.fn(async () => new Blob(["mp3"], { type: "audio/mpeg" }));
    const { result } = renderHook(() => useAlertVoice("alert-1", fetchVoice));
    await act(async () => {
      result.current.play();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      result.current.stop();
    });
    await act(async () => {
      result.current.play();
      await Promise.resolve();
    });
    expect(fetchVoice).toHaveBeenCalledTimes(1);
  });
});
