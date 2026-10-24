import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { ConsoleProvider } from "../console/ConsoleContext";
import { MemoryConsoleStore } from "../console/store";
import { MachinesPage } from "./MachinesPage";
import { SensorsPage } from "./SensorsPage";

describe("MachinesPage", () => {
  it("registers a machine through the mock store", () => {
    const store = new MemoryConsoleStore();
    render(
      <MemoryRouter>
        <AuthGate>
          <ConsoleProvider store={store}>
            <MachinesPage />
          </ConsoleProvider>
        </AuthGate>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /Press-01/ })).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Press-02"), { target: { value: "Press-99" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByText(/Press-99/)).toBeInTheDocument();
    expect(store.getSnapshot().machines.some((item) => item.name === "Press-99")).toBe(true);
  });

  it("keeps the new machine visible on sensor assignment with the same store", () => {
    const store = new MemoryConsoleStore();
    const { unmount } = render(
      <MemoryRouter>
        <AuthGate>
          <ConsoleProvider store={store}>
            <MachinesPage />
          </ConsoleProvider>
        </AuthGate>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByDisplayValue("Press-02"), { target: { value: "Press-99" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    unmount();
    render(
      <MemoryRouter>
        <AuthGate>
          <ConsoleProvider store={store}>
            <SensorsPage />
          </ConsoleProvider>
        </AuthGate>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Press-99")).toBeInTheDocument();
  });
});
