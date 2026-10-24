import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { resetConfigCache } from "../config";

vi.mock("../config", async () => {
  const actual = await vi.importActual<typeof import("../config")>("../config");
  return {
    ...actual,
    getConfig: () => ({
      demoMode: true,
      authDisabled: true,
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      auth0Domain: null,
      auth0ClientId: null,
      auth0Audience: "https://factorypulse-api",
    }),
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it("does not collect passwords when Auth0 is disabled", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sign in to FactoryPulse")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  });
});
