import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createApiClient } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("parses contract error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "missing", code: "alert_not_found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const api = createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true });
    await expect(api.requestJson("/api/alerts/x")).rejects.toMatchObject({
      detail: "missing",
      code: "alert_not_found",
      status: 404,
    });
  });

  it("maps 401 and 403 without a body", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({
      baseUrl: "http://localhost:8000",
      authDisabled: false,
      getToken: async () => "secret-token",
    });
    await expect(api.requestJson("/api/state")).rejects.toMatchObject({
      detail: "Session expired or auth configuration mismatch",
      status: 401,
    });
    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((first[1].headers as Headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("does not send a Bearer token when auth is disabled", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({
      baseUrl: "http://localhost:8000",
      authDisabled: true,
      getToken: async () => "should-not-send",
    });
    await api.requestJson("/api/state");
    const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((first[1].headers as Headers).get("Authorization")).toBeNull();
  });

  it("wraps network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const api = createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true });
    await expect(api.requestJson("/api/state")).rejects.toBeInstanceOf(ApiClientError);
  });
});
