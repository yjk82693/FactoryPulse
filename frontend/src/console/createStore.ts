import type { AppConfig } from "../config";
import { createApiClient } from "../services/api";
import { HttpConsoleStore } from "./httpStore";
import { MemoryConsoleStore, type ConsoleStore } from "./store";

export function shouldUseConsoleHttp(config: AppConfig): boolean {
  return !config.demoMode && config.consoleHttp && Boolean(config.apiUrl);
}

export function createConsoleStore(
  config: AppConfig,
  getToken?: () => Promise<string | null>,
): ConsoleStore {
  if (!shouldUseConsoleHttp(config) || !config.apiUrl) {
    return new MemoryConsoleStore();
  }
  return new HttpConsoleStore(
    createApiClient({
      baseUrl: config.apiUrl,
      authDisabled: config.authDisabled,
      getToken,
    }),
  );
}
