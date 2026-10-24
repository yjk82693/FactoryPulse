import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ProtectedRoute } from "./auth/AuthGate";
import { resetConfigCache } from "./config";

vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config");
  return {
    ...actual,
    getConfig: () => ({
      demoMode: true,
      authDisabled: true,
      consoleHttp: false,
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      auth0Domain: null,
      auth0ClientId: null,
      auth0Audience: "https://factorypulse-api",
    }),
  };
});

function renderPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("console routes", () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it("exposes console navigation on the machines page", () => {
    renderPath("/machines");
    expect(screen.getByText("Machine registry")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Machines" })).toHaveAttribute("href", "/machines");
    expect(screen.getByRole("link", { name: "Profiles" })).toHaveAttribute("href", "/profiles");
    expect(screen.getByRole("link", { name: "Simulator" })).toHaveAttribute("href", "/simulator");
    expect(screen.getByRole("link", { name: "Sensors" })).toHaveAttribute("href", "/sensors");
    expect(screen.getByRole("link", { name: "Optimizer" })).toHaveAttribute("href", "/optimizer");
  });

  it("opens the profiles page", () => {
    renderPath("/profiles");
    expect(screen.getByText("Motion profiles")).toBeInTheDocument();
  });

  it("opens the simulator page", () => {
    renderPath("/simulator");
    expect(screen.getByText(/Motion simulation/)).toBeInTheDocument();
  });

  it("opens sensor assignment", () => {
    renderPath("/sensors");
    expect(screen.getByText("Sensor assignment")).toBeInTheDocument();
  });

  it("opens the sensor placement optimizer", () => {
    renderPath("/optimizer/sensors");
    expect(screen.getByText("Sensor placement optimizer")).toBeInTheDocument();
  });
});

describe("ProtectedRoute", () => {
  it("renders children when Demo Mode skips Auth0", () => {
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <p>console ok</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText("console ok")).toBeInTheDocument();
  });
});
