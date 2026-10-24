import type { Method } from "../types/contract";

export function sensorMethodLabel(method: Method | null | undefined, hasSample: boolean): string {
  if (!hasSample) {
    return "Waiting for sensor samples";
  }
  if (method === "simulated") {
    return "Simulated sensor";
  }
  if (method === "wifi_csi") {
    return "Wi-Fi CSI";
  }
  return "Sensor activity";
}
