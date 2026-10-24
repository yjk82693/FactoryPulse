import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { EXAMPLE_SCENARIO } from "../optimizer/exampleScenario";
import { optimizeLayout } from "../optimizer/search";
import { totalCost } from "../optimizer/cost";
import { OptimizerPage } from "./OptimizerPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthGate>
        <OptimizerPage />
      </AuthGate>
    </MemoryRouter>,
  );
}

describe("OptimizerPage", () => {
  it("shows the example layout, optimizes with algorithm costs, and resets", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Optimize Layout" })).toBeInTheDocument();
    expect(screen.getByText("Example layout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Optimizer" })).toHaveAttribute("href", "/optimizer");

    const baseline = totalCost(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    expect(screen.getByText(baseline.toLocaleString(undefined, { maximumFractionDigits: 1 }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Optimize Layout" }));
    const expected = optimizeLayout(EXAMPLE_SCENARIO, EXAMPLE_SCENARIO.assignment);
    expect(screen.getByText("Suggested layout")).toBeInTheDocument();
    expect(
      screen.getByText(expected.optimizedCost.toLocaleString(undefined, { maximumFractionDigits: 1 })),
    ).toBeInTheDocument();
    expect(screen.getByText(`${expected.improvementAbs.toLocaleString(undefined, { maximumFractionDigits: 1 })} (${expected.improvementPct.toFixed(1)}%)`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Run Optimize Layout to compare/)).toBeInTheDocument();
  });

  it("invalidates the suggestion after a click-to-swap", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Optimize Layout" });
    fireEvent.click(screen.getByRole("button", { name: "Optimize Layout" }));
    expect(screen.getByText("Suggested layout")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /PICK/ }));
    fireEvent.click(screen.getByRole("button", { name: /MOVE/ }));
    expect(screen.getByText(/Run Optimize Layout to compare/)).toBeInTheDocument();
  });
});
