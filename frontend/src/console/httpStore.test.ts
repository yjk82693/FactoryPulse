import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../services/api";
import { HttpConsoleStore } from "./httpStore";
import { ConsoleError } from "./types";

const catalogBody = {
  zones: [{ id: "zone-a", name: "Zone A" }],
  templates: [
    {
      id: "tpl-press",
      name: "Press cycle",
      machine_kind: "press",
      version: 1,
      phases: [{ id: "press", name: "PRESS", expected_activity: 0.8, duration_ticks: 8 }],
    },
  ],
  profiles: [
    {
      id: "prf-1",
      template_id: "tpl-press",
      name: "Press — cell A",
      machine_kind: "press",
      current_version: 1,
    },
  ],
  profile_versions: [
    {
      id: "ver-1",
      profile_id: "prf-1",
      version: 1,
      phases: [{ id: "press", name: "PRESS", expected_activity: 0.8, duration_ticks: 8 }],
    },
  ],
  calibrations: [],
  machines: [
    {
      id: "mch-1",
      name: "Press-01",
      kind: "press",
      zone_id: "zone-a",
      operating_status: "IDLE",
      profile_id: "prf-1",
      sensor_link_ids: [],
    },
  ],
  sensors: [],
  sensing_links: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpConsoleStore", () => {
  it("loads a catalog and does not seed mock machines on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(catalogBody))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "missing", code: "explain_not_configured" }, 501),
      );
    vi.stubGlobal("fetch", fetchMock);
    const store = new HttpConsoleStore(
      createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true }),
    );
    await store.refresh();
    expect(store.getSnapshot().machines[0]?.name).toBe("Press-01");
    expect(store.getMeta().error).toBeNull();

    const failed = new HttpConsoleStore(
      createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true }),
    );
    await failed.refresh();
    expect(failed.getSnapshot().machines).toEqual([]);
    expect(failed.getMeta().error).toMatch(/unable to load console catalog/i);
  });

  it("POSTs a machine then refreshes", async () => {
    let posted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/console/catalog")) {
        const extra = catalogBody.machines.some((item) => item.name === "Press-02")
          ? catalogBody
          : {
              ...catalogBody,
              machines: [
                ...catalogBody.machines,
                {
                  id: "mch-2",
                  name: "Press-02",
                  kind: "press",
                  zone_id: "zone-a",
                  operating_status: "IDLE",
                  profile_id: "prf-1",
                  sensor_link_ids: [],
                },
              ],
            };
        return jsonResponse(posted ? extra : catalogBody);
      }
      if (url.endsWith("/api/console/machines") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string; zone_id: string; operating_status: string };
        expect(body.zone_id).toBe("zone-a");
        expect(body.operating_status).toBe("IDLE");
        posted = true;
        return jsonResponse({
          id: "mch-2",
          name: body.name,
          kind: "press",
          zone_id: "zone-a",
          operating_status: "IDLE",
          profile_id: "prf-1",
          sensor_link_ids: [],
        }, 201);
      }
      return jsonResponse({ detail: "missing", code: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = new HttpConsoleStore(
      createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true }),
    );
    await store.refresh();
    const created = await store.createMachine({
      name: "Press-02",
      kind: "press",
      zoneId: "zone-a",
      status: "IDLE",
      profileId: "prf-1",
    });
    expect(created.name).toBe("Press-02");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects dedicated links with two machines before calling the API", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const store = new HttpConsoleStore(
      createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true }),
    );
    await expect(
      store.upsertLink({
        name: "Bad",
        mode: "dedicated",
        zoneId: "zone-a",
        machineIds: ["a", "b"],
      }),
    ).rejects.toBeInstanceOf(ConsoleError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the last catalog when a later refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(catalogBody))
      .mockResolvedValueOnce(jsonResponse({ detail: "down", code: "request_failed" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const store = new HttpConsoleStore(
      createApiClient({ baseUrl: "http://localhost:8000", authDisabled: true }),
    );
    await store.refresh();
    expect(store.getSnapshot().machines).toHaveLength(1);
    await store.refresh();
    expect(store.getSnapshot().machines[0]?.name).toBe("Press-01");
    expect(store.getMeta().error).toBeTruthy();
    expect(store.getSnapshot().machines[0]?.id).not.toMatch(/^mch-press-01$/);
  });
});
