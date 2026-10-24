import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { ConsoleProvider } from "../console/ConsoleContext";
import { MemoryConsoleStore } from "../console/store";
import { ProfilesPage } from "./ProfilesPage";

function renderProfiles(store = new MemoryConsoleStore()) {
  render(
    <MemoryRouter>
      <AuthGate>
        <ConsoleProvider store={store}>
          <ProfilesPage />
        </ConsoleProvider>
      </AuthGate>
    </MemoryRouter>,
  );
  return store;
}

describe("ProfilesPage", () => {
  it("creates a profile from a template and records per-installation calibration", () => {
    const store = renderProfiles();
    fireEvent.change(screen.getByDisplayValue("Press — line 2"), {
      target: { value: "Press — line 2 synthetic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create from template" }));
    expect(screen.getByRole("button", { name: /Press — line 2 synthetic/ })).toBeInTheDocument();
    expect(store.getSnapshot().profiles.some((item) => item.name === "Press — line 2 synthetic")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Start calibration" }));
    expect(screen.getByText(/calibrating v/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Capture baseline" }));
    expect(screen.getByText(/calibrated v/)).toBeInTheDocument();
    expect(screen.getByText(/not a measured RF fingerprint/i)).toBeInTheDocument();
  });
});
