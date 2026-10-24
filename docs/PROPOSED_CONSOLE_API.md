# Proposed console APIs — superseded by Contract v1.3

The official Console API is **`docs/event-schema.md` sections 14–16**.

This file was a pre-contract sketch. Differences vs v1.3 (v1.3 wins):

- Path is `/api/console/sensing-links`, not `/sensor-links`.
- Calibrations are `GET/POST /api/console/calibrations`, not nested only on profiles.
- Profile versions are immutable (`POST .../versions`).
- Physical sensors are GET-only in P0; ingest bind stays env → `assembly_01`.

The frontend still uses **in-memory** `MemoryConsoleStore` (`frontend/src/console/`) until Developer B implements `/api/console/*` and Developer C adds `HttpConsoleStore`.

Live cell ingest remains unchanged: `POST /api/events`, `GET /api/state`, `/ws`.
