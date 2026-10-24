import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

function env(overrides: Record<string, string | undefined> = {}): ImportMetaEnv {
  return {
    VITE_DEMO_MODE: "true",
    VITE_AUTH_DISABLED: "true",
    ...overrides,
  } as ImportMetaEnv;
}

describe("parseConfig", () => {
  it("defaults VITE_CONSOLE_HTTP to false when unset", () => {
    expect(parseConfig(env()).consoleHttp).toBe(false);
  });

  it("parses VITE_CONSOLE_HTTP=true", () => {
    expect(parseConfig(env({ VITE_CONSOLE_HTTP: "true" })).consoleHttp).toBe(true);
  });
});
