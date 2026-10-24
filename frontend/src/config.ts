export interface AppConfig {
  demoMode: boolean;
  authDisabled: boolean;
  consoleHttp: boolean;
  apiUrl: string | null;
  wsUrl: string | null;
  auth0Domain: string | null;
  auth0ClientId: string | null;
  auth0Audience: string | null;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requiredBool(raw: string | undefined, name: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigError(`${name} must be "true" or "false".`);
}

function optionalBool(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return requiredBool(raw, name);
}

function trim(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function parseConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  const demoMode = requiredBool(env.VITE_DEMO_MODE, "VITE_DEMO_MODE");
  const authDisabled = requiredBool(env.VITE_AUTH_DISABLED, "VITE_AUTH_DISABLED");
  const consoleHttp = optionalBool(env.VITE_CONSOLE_HTTP, false, "VITE_CONSOLE_HTTP");
  const apiUrl = trim(env.VITE_API_URL);
  const wsUrl = trim(env.VITE_WS_URL);
  const auth0Domain = trim(env.VITE_AUTH0_DOMAIN);
  const auth0ClientId = trim(env.VITE_AUTH0_CLIENT_ID);
  const auth0Audience = trim(env.VITE_AUTH0_AUDIENCE);

  if (!demoMode && (!apiUrl || !wsUrl)) {
    throw new ConfigError(
      "Live Mode requires VITE_API_URL and VITE_WS_URL.",
    );
  }

  if (!authDisabled && (!auth0Domain || !auth0ClientId || !auth0Audience)) {
    throw new ConfigError(
      "Auth0 mode requires VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, and VITE_AUTH0_AUDIENCE.",
    );
  }

  return {
    demoMode,
    authDisabled,
    consoleHttp,
    apiUrl,
    wsUrl,
    auth0Domain,
    auth0ClientId,
    auth0Audience,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    cached = parseConfig();
  }
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
