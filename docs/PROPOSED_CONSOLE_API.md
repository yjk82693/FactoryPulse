# Proposed console APIs (review with Developer B)

This document is **not** Contract v1.2. Do not implement these endpoints until A, B, and C agree. The frontend currently uses **in-memory mock adapters** (`frontend/src/console/`) so Demo Mode works without `backend/`.

Existing live cell monitoring remains `docs/event-schema.md`: `POST /api/events` sensor ingest, `GET /api/state`, `/ws`, alerts, voice.

## Why a separate proposal

Registry, profiles, simulation, sensor assignment, and sensor-placement scoring are **console configuration**. They are not CSI packets and not machine-sim step events.

## Suggested resource shapes (names only)

- `Machine`: id, name, kind (`press|picker|conveyor`), zone_id, operating_status, profile_id, sensor_link_ids
- `MotionProfile`: id, template_id, name, machine_kind, version, phases[], calibrations[]
- `SensorLink`: id, name, mode (`dedicated|shared_zone`), zone_id, machine_ids[]
- Simulation stays **client-side synthetic** unless B later exposes a replay API. Do not POST raw CSI heatmaps as if they were v1.2 events.

## Suggested routes (unofficial)

None of these exist today:

- `GET/POST /api/console/machines`
- `PATCH/DELETE /api/console/machines/{id}`
- `GET/POST /api/console/profiles`
- `POST /api/console/profiles/{id}/calibrations`
- `GET/PUT/DELETE /api/console/sensor-links`

Auth would follow the same Bearer / `AUTH_DISABLED` rules as other operator APIs. Company scoping like the rest of the product.

## Mapping later

Replace `MemoryConsoleStore` with an HTTP adapter that implements the same TypeScript methods. UI pages should not need a rewrite if the interface stays stable.

## Do not

- Treat console anomaly alerts as `STEP_FAILURE`
- Add heatmap blobs to the v1.2 event envelope without a three-way contract change
- Claim placement scores are measured RF accuracy
