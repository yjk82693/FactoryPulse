import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./AuthGate";
import { resetConfigCache } from "../config";

vi.mock("../config", async () => {
  const actual = await vi.importActual<typeof import("../config")>("../config");
  return {
    ...actual,
    getConfig: () => ({
      demoMode: false,
      authDisabled: false,
      apiUrl: "http://localhost:8000",
      wsUrl: "ws://localhost:8000/ws",
      auth0Domain: "example.auth0.com",
      auth0ClientId: "client",
      auth0Audience: "https://factorypulse-api",
    }),
  };
});

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({ isAuthenticated: false, isLoading: false, logout: vi.fn() }),
  Auth0Provider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("ProtectedRoute live auth", () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it("redirects unauthenticated operators to login", () => {
    render(
      <MemoryRouter initialEntries={["/machines"]}>
        <Routes>
          <Route path="/login" element={<p>Sign in</p>} />
          <Route
            path="/machines"
            element={
              <ProtectedRoute>
                <p>Machine registry</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.queryByText("Machine registry")).not.toBeInTheDocument();
  });
});
