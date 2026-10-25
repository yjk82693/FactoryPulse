# FactoryPulse backend — Contract v1.3

Based on `origin/main` at `026c0ed` (includes the requested `22e362e` integration baseline).
The canonical API contract remains [`../docs/event-schema.md`](../docs/event-schema.md).
No frontend, hardware/sensing, canonical contract, or C-owned AI service implementation is changed here.

## Run locally

From the repository root, create a Python 3.11+ environment and install:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

Copy `backend/.env.example` to `backend/.env`, set `SENSOR_INGEST_KEY`, then:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1 --env-file backend/.env
```

`AUTH_DISABLED=true` is accepted only with `APP_ENV=development|local|test`.
Dashboard/Console REST and WebSocket bypass is restricted to loopback clients.
Sensor ingest is separately authenticated by sensor headers and may arrive from hardware over LAN;
`/health` remains public. Bind loopback for local use and do not expose a development bypass
through a public reverse proxy. Use `AUTH_DISABLED=false` and `APP_ENV=production` for deployment.

## Console endpoint roster

All reads use operator/supervisor authentication; writes require supervisor.
All entity lookups are scoped to the server-resolved company. Cross-company IDs return 404.
Wire fields are snake_case and match the existing frontend `HttpConsoleStore` / `wire.ts`.

| Methods | Path |
|---|---|
| GET | `/api/console/catalog` |
| GET | `/api/console/zones`, `/api/console/zones/{id}` |
| GET, POST | `/api/console/machines` |
| GET, PATCH, DELETE | `/api/console/machines/{id}` |
| GET | `/api/console/profile-templates` |
| GET, POST | `/api/console/profiles` |
| GET | `/api/console/profiles/{id}` |
| GET, POST | `/api/console/profiles/{id}/versions` |
| GET | `/api/console/profiles/{id}/versions/{version_id}` |
| PATCH → 422 immutable_version | `/api/console/profiles/{id}/versions/{version_id}` |
| GET, POST | `/api/console/calibrations` |
| GET | `/api/console/sensors`, `/api/console/sensors/{id}` |
| GET, POST | `/api/console/sensing-links` |
| GET, PUT, DELETE | `/api/console/sensing-links/{id}` |

Profile creation returns a top-level profile `id`, with version 1 in the catalog.
New versions clone the current phases if no body or `{}` is sent. Existing phase snapshots
are immutable in the API and through a database update trigger. Calibration starts at version
0 until first calibrated, then increments on transitions to calibrated (or calibration of a
different immutable version). Repeating the identical calibrated state does not increment.

Machine/link membership is synchronized atomically. A link's machines must belong to its
zone. Removing the last member removes the orphan link. Deleting a machine also removes
its calibration records. Empty links are never returned. Dedicated paths still carry an
RF isolation disclaimer. Console status and link membership never change live-cell state
or the sensor-ingest allow-list. Sensor identity/binding is read-only in P0.

The demo company seeds two zones and three synthetic profile templates with baseline
profiles/versions; no Console machines or measured calibration data are fabricated.
Other companies start with empty Console resources and use the shared immutable templates.
Zone creation is optional/out of this P0 implementation; provision zones for new companies
through deployment administration before adding machines.

## Persistence and migrations

Unset `DATABASE_URL`: development memory storage; restart loses data.
Set `DATABASE_URL`: PostgreSQL/Tiger Data storage; credentials are read only from the environment.
Use the Tiger Data connection string with its required TLS settings (normally `sslmode=require`).
Configured database errors never silently switch to memory. Startup failures stop startup;
runtime database failures return a generic 503 without connection details.

Startup applies versioned SQL files from `backend/migrations/` in a transaction under an
advisory lock. No destructive reset or schema drop runs at startup. Existing deployments
with a separately created schema need migration reconciliation before first deployment;
the migrations deliberately refuse conflicting pre-existing tables instead of overwriting them.
Back up existing data and review migrations before deploying. Demo seeds run once and do not
recreate deleted resources on restart. Console rows carry company IDs, and relational references
include company IDs. Profile versions and calibration installation pairs have unique indexes.

Events use transactional `event_ids` deduplication and an `events` table with received-at
timestamps. When the `timescaledb` extension is already installed (as on Tiger Data), the migration
creates an events hypertable on `ts`; plain PostgreSQL uses the same API with an ordinary table.
No event-ID uniqueness constraint is added to the hypertable. Event/alert/snapshot persistence
commits before WebSocket publication. Failed writes roll back the in-memory state too.
Database deduplication prevents reapplying an old event after a restart or memory-ring eviction.
The HTTP `duplicate` flag still describes the in-memory check per v1.2; a database-only
duplicate can return `accepted:false, duplicate:false`.
Acknowledgements persist with their system events. Statistics use UTC hourly buckets.

Run **one worker / one backend instance per database** for the v1.3 in-process live cell.
A session advisory lock rejects a competing live backend. Horizontal live streaming requires
a shared broker/aggregate implementation beyond this P0. Simulator database outages retry
without inventing machine failures or publishing uncommitted events. PostgreSQL operations
are synchronous and optimized for this single-cell prototype; high-rate production ingest
would require async/pool and backpressure work.

## Auth0 and membership provisioning

Set `AUTH_DISABLED=false`, `AUTH0_DOMAIN` (hostname only), and `AUTH0_AUDIENCE`.
The verifier uses Auth0 JWKS and allows only RS256, requiring `sub`, `iss`, `aud`, and `exp`.
Invalid/missing tokens return 401; valid subjects without membership return 403.
JWT tenant/role claims cannot grant membership. Membership comes from `users` and
`memberships` joined with `companies`. Optional `DEMO_AUTO_JOIN=true` creates only a demo
operator; leave false for controlled deployments.

Provision a durable membership explicitly from a trusted administrative environment:

```powershell
# DATABASE_URL must already be set in the environment.
.\.venv\Scripts\python.exe -m backend.manage --subject 'auth0|SUBJECT' --company-id demo-co --company-name 'Demo Manufacturing' --name 'Operator Name' --role supervisor
```

There is no public endpoint for role elevation. Without a database, demo auto-join is
ephemeral. Multiple memberships are rejected as ambiguous because v1.3 has no active-company
selection protocol. Auth0 organization claims are not implicitly trusted or used to select a tenant.

WebSocket clients send `{ "type": "auth", "token": "..." }` within 5 seconds, then receive
ready, state, deltas in order. Invalid/missing tokens close 4401; missing membership closes
4403. Bypass mode immediately sends ready/state. All broadcasts use company-specific hubs.
The only live cell remains demo-co / `assembly_01`: another company's `/api/state` returns 404
and live WebSocket closes 4403, while its own Console, event and alert reads remain isolated.

## Developer C integration / AI ownership

Enable `VITE_CONSOLE_HTTP=true` to connect the existing Console adapter; use matching frontend
and backend auth settings. CORS permits the standard localhost/127.0.0.1 Vite origins and
GET/POST/PATCH/PUT/DELETE. Production origins still require deployment configuration.

C's existing `backend.ai.routes.create_briefing_router` is registered unchanged.
B wraps it with authentication and company-scoped persisted context. Old related events
are read from the database even after the live memory ring rotates. Route responses remain
`{explanation}` / MP3; absent services keep C's specified 501 codes after alert ownership lookup.
No duplicate Gemini or ElevenLabs service was created. Future C routers must use the same
authentication dependency and company-scoped context boundary.

## Validation

```powershell
# Existing sensing regression imports require these test-only packages.
.\.venv\Scripts\python.exe -m pip install numpy pyserial
.\.venv\Scripts\python.exe -m unittest backend.test_live backend.ai.test_briefings backend.test_console backend.test_auth backend.test_persistence -v
```

Database tests are skipped unless `TEST_DATABASE_URL` points to a disposable PostgreSQL
test server. They create a unique test schema and remove only that schema afterwards.
They cover restart recovery, acknowledgements, sensor hashes, durable AI context, cross-tenant
foreign keys, immutable versions, concurrent version increments, metrics, migration re-entry,
single live owner, and rollback without broadcasts. JWT tests sign actual RSA tokens and
mock only JWKS retrieval; they do not contact a real Auth0 tenant.

To verify the real unmodified frontend HTTP adapter, compile it to a disposable output folder:

```powershell
node frontend/node_modules/typescript/bin/tsc frontend/src/console/httpStore.ts --outDir .backend-test-db/http-adapter --target ES2022 --module commonjs --skipLibCheck
# Run a separate disposable, auth-disabled backend on port 18001 first.
node backend/http_console_smoke.cjs .backend-test-db/http-adapter http://127.0.0.1:18001
```

Verified locally: plain PostgreSQL 17 and the actual HttpConsoleStore over HTTP, plus existing
live-cell and mocked-provider AI regressions. Still requires team/deployment verification:
Tiger Data's hosted TimescaleDB hypertable branch, real Auth0 JWKS/account configuration,
real Gemini/ElevenLabs credentials, and Developer A's physical ESP32 end-to-end stream.
