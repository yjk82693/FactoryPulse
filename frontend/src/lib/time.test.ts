import { describe, expect, it } from "vitest";
import { parseValidTimestamp, relativeTime } from "./time";

describe("parseValidTimestamp and relativeTime", () => {
  it("accepts a valid ISO timestamp and rejects missing or invalid values", () => {
    expect(parseValidTimestamp("2026-10-24T18:30:00.000Z")).toBe(Date.parse("2026-10-24T18:30:00.000Z"));
    expect(parseValidTimestamp(null)).toBeNull();
    expect(parseValidTimestamp("")).toBeNull();
    expect(parseValidTimestamp("not-a-date")).toBeNull();
  });

  it("formats relative time from a valid timestamp and stays empty when invalid", () => {
    const now = Date.parse("2026-10-24T18:30:10.000Z");
    expect(relativeTime("2026-10-24T18:30:00.000Z", now)).toBe("10s ago");
    expect(relativeTime("bad", now)).toBe("");
  });
});
