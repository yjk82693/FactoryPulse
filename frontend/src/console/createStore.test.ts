import { describe, expect, it } from "vitest";
import { createConsoleStore, shouldUseConsoleHttp } from "./createStore";
import { MemoryConsoleStore } from "./store";
import { HttpConsoleStore } from "./httpStore";
import type { AppConfig } from "../config";

const base: AppConfig = {
  demoMode: true,
  authDisabled: true,
  consoleHttp: false,
  apiUrl: "http://localhost:8000",
  wsUrl: "ws://localhost:8000/ws",
  auth0Domain: null,
  auth0ClientId: null,
  auth0Audience: null,
};

describe("createConsoleStore", () => {
  it("keeps mocks in Demo Mode even if console HTTP is requested", () => {
    expect(shouldUseConsoleHttp({ ...base, demoMode: true, consoleHttp: true })).toBe(false);
    expect(createConsoleStore({ ...base, demoMode: true, consoleHttp: true })).toBeInstanceOf(MemoryConsoleStore);
  });

  it("uses HttpConsoleStore only in Live Mode with VITE_CONSOLE_HTTP", () => {
    expect(shouldUseConsoleHttp({ ...base, demoMode: false, consoleHttp: true })).toBe(true);
    expect(createConsoleStore({ ...base, demoMode: false, consoleHttp: true })).toBeInstanceOf(HttpConsoleStore);
  });

  it("defaults Live Mode to mocks until B confirms Console APIs", () => {
    expect(shouldUseConsoleHttp({ ...base, demoMode: false, consoleHttp: false })).toBe(false);
    expect(createConsoleStore({ ...base, demoMode: false, consoleHttp: false })).toBeInstanceOf(MemoryConsoleStore);
  });
});
