import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeState } from "../test/fixtures";
import { ActivityIndicator } from "./ActivityIndicator";

describe("ActivityIndicator", () => {
  it("shows a live score when the backend is live and the sensor is connected", () => {
    render(<ActivityIndicator sensor={makeState().sensor} backendLive />);
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Sensor connected")).toBeInTheDocument();
    expect(screen.getByText(/Updated /)).toBeInTheDocument();
  });

  it("does not treat a cached score as live when the sensor is disconnected", () => {
    const sensor = { ...makeState().sensor, connected: false, active: true };
    render(<ActivityIndicator sensor={sensor} backendLive />);
    expect(screen.getByText("Last reading (stale)")).toBeInTheDocument();
    expect(screen.getByText("Not live")).toBeInTheDocument();
    expect(screen.getByText("Sensor disconnected")).toBeInTheDocument();
    expect(screen.queryByText("Sensor connected")).not.toBeInTheDocument();
  });

  it("does not imply a live sensor when the backend is down", () => {
    render(<ActivityIndicator sensor={makeState().sensor} backendLive={false} />);
    expect(screen.getByText("Cached reading")).toBeInTheDocument();
    expect(screen.getByText("Last reading (stale)")).toBeInTheDocument();
    expect(screen.queryByText("Sensor disconnected")).not.toBeInTheDocument();
  });

  it("omits last-update time when last_update_at is missing or invalid", () => {
    const sensor = { ...makeState().sensor, last_update_at: null, connected: false, method: "wifi_csi" as const };
    render(<ActivityIndicator sensor={sensor} backendLive />);
    expect(screen.queryByText(/Updated /)).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for sensor samples")).toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi CSI")).not.toBeInTheDocument();
  });
});
