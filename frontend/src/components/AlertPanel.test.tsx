import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlertPanel } from "./AlertPanel";
import { makeAlert } from "../test/fixtures";

describe("AlertPanel", () => {
  it("shows the three highest-severity open alerts and keeps the rest available", () => {
    const alerts = [
      makeAlert({
        alert_id: "a1",
        severity: "info",
        message: "Info one",
        created_at: "2026-10-24T18:31:00.000Z",
      }),
      makeAlert({
        alert_id: "a2",
        severity: "warning",
        message: "Warning one",
        created_at: "2026-10-24T18:32:00.000Z",
      }),
      makeAlert({
        alert_id: "a3",
        severity: "critical",
        message: "Critical one",
        created_at: "2026-10-24T18:30:00.000Z",
      }),
      makeAlert({
        alert_id: "a4",
        severity: "info",
        message: "Info two",
        created_at: "2026-10-24T18:33:00.000Z",
      }),
      makeAlert({
        alert_id: "a5",
        severity: "warning",
        message: "Acknowledged warning",
        acknowledged: true,
        acknowledged_by: "demo-operator",
        acknowledged_at: "2026-10-24T18:34:00.000Z",
        created_at: "2026-10-24T18:29:00.000Z",
      }),
    ];

    render(
      <AlertPanel
        alerts={alerts}
        voiceEnabled={false}
        fetchVoice={null}
        onAcknowledge={vi.fn()}
        pendingId={null}
      />,
    );

    expect(screen.getByText("Operational alerts · 4 open")).toBeInTheDocument();
    expect(screen.getByText("Critical one")).toBeInTheDocument();
    expect(screen.getByText("Warning one")).toBeInTheDocument();
    expect(screen.getByText("Info two")).toBeInTheDocument();
    expect(screen.queryByText("Info one")).not.toBeInTheDocument();
    expect(screen.queryByText("Acknowledged warning")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Info two")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged warning")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Acknowledge" })).toHaveLength(4);
  });
});
