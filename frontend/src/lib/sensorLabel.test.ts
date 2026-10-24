import { describe, expect, it } from "vitest";
import { sensorMethodLabel } from "./sensorLabel";

describe("sensorMethodLabel", () => {
  it("does not claim Wi-Fi CSI before any sample arrives", () => {
    expect(sensorMethodLabel("wifi_csi", false)).toBe("Waiting for sensor samples");
    expect(sensorMethodLabel("simulated", true)).toBe("Simulated sensor");
    expect(sensorMethodLabel("wifi_csi", true)).toBe("Wi-Fi CSI");
  });
});
