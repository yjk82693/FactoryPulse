import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceButton } from "./VoiceButton";
import { resetVoiceForTests } from "../hooks/useAlertVoice";

afterEach(() => {
  resetVoiceForTests();
});

describe("VoiceButton", () => {
  it("is disabled in Demo Mode and does not fetch", () => {
    const fetchVoice = vi.fn();
    render(
      <VoiceButton
        alertId="alert-1"
        demoMode
        voiceEnabled={false}
        fetchVoice={fetchVoice}
      />,
    );
    const button = screen.getByRole("button", { name: "Listen to Alert" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Voice alerts require Live Mode");
    expect(fetchVoice).not.toHaveBeenCalled();
  });

  it("is disabled when the server has not configured voice", () => {
    const fetchVoice = vi.fn();
    render(
      <VoiceButton
        alertId="alert-1"
        demoMode={false}
        voiceEnabled={false}
        fetchVoice={fetchVoice}
      />,
    );
    const button = screen.getByRole("button", { name: "Listen to Alert" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Voice alerts not configured on server");
    expect(fetchVoice).not.toHaveBeenCalled();
  });
});
