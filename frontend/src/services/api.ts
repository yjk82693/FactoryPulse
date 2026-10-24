import type { ApiError } from "../types/contract";

export class ApiClientError extends Error {
  readonly detail: string;
  readonly code: string;
  readonly status: number;

  constructor(detail: string, code: string, status: number) {
    super(detail);
    this.name = "ApiClientError";
    this.detail = detail;
    this.code = code;
    this.status = status;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  authDisabled: boolean;
  getToken?: () => Promise<string | null>;
}

async function parseError(response: Response): Promise<ApiClientError> {
  let detail = `Request failed (${response.status})`;
  let code = "request_failed";
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.detail === "string" && body.detail.length > 0) {
      detail = body.detail;
    }
    if (typeof body.code === "string" && body.code.length > 0) {
      code = body.code;
    }
  } catch {
    // Non-JSON error body; keep fallback message, never log the raw body.
  }
  return new ApiClientError(detail, code, response.status);
}

export function createApiClient(options: ApiClientOptions) {
  async function headers(init?: HeadersInit): Promise<Headers> {
    const headers = new Headers(init);
    if (!options.authDisabled) {
      const token = (await options.getToken?.()) ?? null;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return headers;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const merged = new Headers(await headers(init.headers));
    if (init.body && !merged.has("Content-Type")) {
      merged.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await fetch(`${options.baseUrl}${path}`, {
        ...init,
        headers: merged,
      });
    } catch {
      throw new ApiClientError("Unable to reach the FactoryPulse API", "network_error", 0);
    }
    if (!response.ok) {
      const error = await parseError(response);
      if (error.status === 401 && error.code === "request_failed") {
        throw new ApiClientError(
          "Session expired or auth configuration mismatch",
          "unauthenticated",
          401,
        );
      }
      if (error.status === 403 && error.code === "request_failed") {
        throw new ApiClientError("No access to this company", "forbidden", 403);
      }
      throw error;
    }
    return response;
  }

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await request(path, init);
    return (await response.json()) as T;
  }

  async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
    const response = await request(path, init);
    return await response.blob();
  }

  return { request, requestJson, requestBlob };
}

export type ApiClient = ReturnType<typeof createApiClient>;
