import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ActivityChart } from "./ActivityChart";

beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

describe("ActivityChart", () => {
  const samples = [{ t: Date.now() - 1000, score: 0.4, threshold: 0.55, active: false }];

  it("labels frozen samples when the backend is live but the sensor is down", () => {
    render(
      <ActivityChart samples={samples} method="wifi_csi" connected={false} backendLive />,
    );
    expect(screen.getByText("Sensor disconnected")).toBeInTheDocument();
    expect(screen.getByText("Frozen last samples · not a live reading")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi CSI · last 120s")).toBeInTheDocument();
  });

  it("does not title an empty chart as Wi-Fi CSI", () => {
    render(<ActivityChart samples={[]} method="wifi_csi" connected={false} backendLive />);
    expect(screen.getByText("Waiting for sensor samples · last 120s")).toBeInTheDocument();
    expect(screen.getByText("Waiting for activity samples")).toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi CSI · last 120s")).not.toBeInTheDocument();
  });

  it("does not use the sensor-disconnected badge when the backend itself is down", () => {
    render(
      <ActivityChart samples={samples} method="wifi_csi" connected backendLive={false} />,
    );
    expect(screen.queryByText("Sensor disconnected")).not.toBeInTheDocument();
    expect(screen.getByText("Frozen last samples · not a live reading")).toBeInTheDocument();
  });
});
