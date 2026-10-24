import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { ConsoleProvider } from "../console/ConsoleContext";
import { SimulatorPage } from "./SimulatorPage";

function renderSim() {
  return render(
    <MemoryRouter>
      <AuthGate>
        <ConsoleProvider>
          <SimulatorPage />
        </ConsoleProvider>
      </AuthGate>
    </MemoryRouter>,
  );
}

describe("SimulatorPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not open a review alert for a short disturbance", () => {
    vi.useFakeTimers();
    renderSim();
    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "short_disturbance" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => {
      vi.advanceTimersByTime(40 * 180);
    });
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
    expect(screen.getByText(/No review alerts/)).toBeInTheDocument();
  });

  it("plays a seeded sustained scenario and opens a review alert, not a fault", () => {
    vi.useFakeTimers();
    renderSim();
    expect(screen.getByText(/Synthetic expected vs observed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => {
      vi.advanceTimersByTime(30 * 180);
    });
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText(/Operator review recommended/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/No review alerts/)).toBeInTheDocument();
  });
});
