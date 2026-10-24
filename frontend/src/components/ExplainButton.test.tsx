import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeAlert } from "../test/fixtures";
import { ApiClientError } from "../services/api";
import { ExplainButton } from "./ExplainButton";

describe("ExplainButton", () => {
  it("is hidden in Demo Mode", () => {
    const fetchExplain = vi.fn();
    render(
      <ExplainButton
        alert={makeAlert()}
        demoMode
        explainEnabled
        fetchExplain={fetchExplain}
      />,
    );
    expect(screen.queryByRole("button", { name: "Explain" })).not.toBeInTheDocument();
    expect(fetchExplain).not.toHaveBeenCalled();
  });

  it("loads an explanation and keeps facts separate from interpretations", async () => {
    const fetchExplain = vi.fn(async () => ({ explanation: "Could be expected motion." }));
    render(
      <ExplainButton
        alert={makeAlert()}
        demoMode={false}
        explainEnabled
        fetchExplain={fetchExplain}
        machineId="assembly_01"
        currentStep="ASSEMBLE"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    await waitFor(() => expect(screen.getByText("Could be expected motion.")).toBeInTheDocument());
    expect(screen.getByText("Observed facts")).toBeInTheDocument();
    expect(screen.getByText("Possible interpretations")).toBeInTheDocument();
    expect(screen.getByText(/not a confirmed machine fault/i)).toBeInTheDocument();
    expect(fetchExplain).toHaveBeenCalledTimes(1);
  });

  it("disables after 501 without treating it as a confirmed fault", async () => {
    const fetchExplain = vi.fn(async () => {
      throw new ApiClientError("unset", "explain_not_configured", 501);
    });
    render(
      <ExplainButton
        alert={makeAlert()}
        demoMode={false}
        explainEnabled
        fetchExplain={fetchExplain}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Explain" })).toBeDisabled(),
    );
    expect(screen.getByTitle("Alert explanations are not configured on the server.")).toBeInTheDocument();
  });
});
