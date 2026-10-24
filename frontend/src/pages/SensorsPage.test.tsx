import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { ConsoleProvider } from "../console/ConsoleContext";
import { MemoryConsoleStore } from "../console/store";
import { SensorsPage } from "./SensorsPage";

describe("SensorsPage", () => {
  it("shows shared-zone overlap and can add a dedicated link", () => {
    const store = new MemoryConsoleStore();
    render(
      <MemoryRouter>
        <AuthGate>
          <ConsoleProvider store={store}>
            <SensorsPage />
          </ConsoleProvider>
        </AuthGate>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Press-01 and Picker-01 may produce overlapping CSI/)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("CSI link Zone A extra"), {
      target: { value: "Dedicated Press" },
    });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "dedicated" } });
    fireEvent.click(screen.getByLabelText("Picker-01"));
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(screen.getByText(/Dedicated Press/)).toBeInTheDocument();
    expect(store.getSnapshot().links.some((link) => link.name === "Dedicated Press" && link.mode === "dedicated")).toBe(
      true,
    );
  });
});
