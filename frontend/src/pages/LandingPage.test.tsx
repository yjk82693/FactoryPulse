import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("renders the public homepage with demo and login CTAs", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("See Every Motion. Understand Every Cycle.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Explore Demo" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Wi-Fi Motion Sensing")).toBeInTheDocument();
    expect(screen.getByText("Machine Cycle Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Real-Time Operational Alerts")).toBeInTheDocument();
  });
});
