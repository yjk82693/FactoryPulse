import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { ConsoleProvider } from "../console/ConsoleContext";
import { SensorPlacementPage } from "./SensorPlacementPage";

describe("SensorPlacementPage", () => {
  it("compares dedicated, shared-zone, and mixed strategies as labeled assumptions", () => {
    render(
      <MemoryRouter>
        <AuthGate>
          <ConsoleProvider>
            <SensorPlacementPage />
          </ConsoleProvider>
        </AuthGate>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Dedicated links · recommended/)).toBeInTheDocument();
    expect(screen.getByText("Shared-zone links")).toBeInTheDocument();
    expect(screen.getByText(/Mixed \(press dedicated, others shared\)/)).toBeInTheDocument();
    expect(screen.getByText(/not measured RF propagation/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Layout" })).toHaveAttribute("href", "/optimizer");
    expect(screen.getByRole("link", { name: "Sensor placement" })).toHaveAttribute("href", "/optimizer/sensors");
  });
});
