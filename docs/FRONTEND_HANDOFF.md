# FactoryPulse frontend handoff

Handoff for a new Grok conversation. Developer C owns `frontend/` only. Do not edit `backend/`, `firmware/`, `sensing/`, or `docs/event-schema.md` unless the team agrees. Do not invent API fields. Do not claim untested integrations. Do not push to origin without explicit approval.

**Checkpoint:** local `main` only. Feature commit `2a0ecaf`. Not pushed.

---

## 1. Project overview and hackathon objectives

FactoryPulse is a HackPSU Fall 2026 prototype: one simulated assembly cell plus Wi-Fi CSI activity sensing (2× ESP32), context-aware operational alerts, and a live dashboard.

Constraints everyone must keep:

- The machine is simulated. The UI must label simulated sensor data.
- CSI activity is an operational observation, not certified safety monitoring. Copy must never claim a verified incident, identity, or location.
- Contract **v1.3** in `docs/event-schema.md` is the source of truth (v1.2 archived at `docs/archive/event-schema-v1.2.md`).
- ElevenLabs and Gemini keys live only on the backend. The browser never calls ElevenLabs or Gemini.
- No custom username/password forms. Auth is Auth0 Universal Login, or auth-disabled local continue.
- Never commit secrets (`.env`, Client Secret, sensor keys, API keys).

---

## 2. Team responsibilities

| Role | Owns | Notes |
|---|---|---|
| **A** | `firmware/`, `sensing/` | ESP32, Wi-Fi CSI ingest into backend `POST /api/events` |
| **B** | `backend/` | FastAPI, machine simulator, Tiger Data, Auth0 JWT, ElevenLabs TTS, Gemini explain |
| **C** | `frontend/` | React dashboard, Auth0 SPA, voice **UI** (plays MP3 from backend) |
| Shared | `docs/event-schema.md` | Change only with A+B+C agreement |

Developer C in this repo: Yoojun.

---

## 3. Frontend architecture

Stack: Vite 5, React 18, TypeScript strict, React Router 6, Vitest + Testing Library, `@auth0/auth0-react`.

App root: `frontend/`. Dev server: `http://localhost:5173`. Backend (Live): `http://localhost:8000`.

### Routes (`frontend/src/App.tsx`)

| Path | Page | Auth |
|---|---|---|
| `/` | `LandingPage` | Public |
| `/login` | `LoginPage` | Public. Auth0 redirect, or “Continue to dashboard” when `VITE_AUTH_DISABLED=true` |
| `/dashboard` | `DashboardPage` | `ProtectedRoute`: skipped when auth disabled **or** Demo Mode; otherwise Auth0 session required |
| `/machines` `/profiles` `/simulator` `/sensors` | Console pages | Same protection. `MemoryConsoleStore` by default; `HttpConsoleStore` when Live + `VITE_CONSOLE_HTTP=true` |
| `/optimizer` | Layout optimizer | Same protection. Example floor, not CSI |
| `/optimizer/sensors` | Sensor-placement comparison | Illustrative cost/coverage/ambiguity scores |
| `/access-denied` | `AccessDenied` | Public; used for company/membership failures |
| `*` | `NotFound` | Public |

`AuthGate` wraps all routes. If auth is enabled it mounts `Auth0Provider` (`cacheLocation: "memory"`, `redirect_uri: window.location.origin`, `audience` from env, `scope: openid profile email`). `onRedirectCallback` navigates to `appState.returnTo` or `/dashboard`.

### Data flow

- `getConfig()` in `src/config.ts` reads Vite env **once** at startup. Modes are not switched at runtime. Restart `npm run dev` after `.env` changes.
- `useFactoryStream` + `streamReducer` hold connection status, ready identity, State, events, alerts.
- `DataSource` interface:
  - **DemoSource** — local contract-valid simulation. Zero network.
  - **LiveSource** — `GET /api/state` then WebSocket `/ws`, plus `/api/me` and `POST /api/alerts/{id}/ack`. Never falls back to demo data. Local FastAPI in `backend/` is auth-disabled in-memory only (`docs/live-csi.md`).
- Console modules use a separate `ConsoleStore` (`frontend/src/console/`). Default `MemoryConsoleStore`. Live Mode + `VITE_CONSOLE_HTTP=true` uses `HttpConsoleStore` (snake_case catalog). Failures do not fall back to mocks. Do not merge this into `streamReducer`. Contract v1.3 `docs/event-schema.md` §§14–16.

### Major UI components

| Area | Files |
|---|---|
| Brand | `components/BrandMark.tsx` |
| Shell | `components/Header.tsx`, `DemoBanner.tsx` |
| Cell | `MachineStatusCard`, `WorkflowStepper`, `ActivityIndicator`, `ActivityChart`, `StepDurationChart`, `EventTimeline` |
| Alerts | `AlertPanel`, `AlertItem`, `VoiceButton`, `ExplainButton` |
| Voice | `hooks/useAlertVoice.ts` — POST voice, blob URL cache, play/pause/stop, single `HTMLAudioElement` |
| Explain | `lib/explainBriefing.ts` — facts vs interpretations vs checks; never confirmed faults |
| Auth | `auth/AuthGate.tsx`, `auth/tokenContext.ts`, `auth/useAccessToken.ts` |
| API/WS | `services/api.ts`, `services/ws.ts` |
| Types | `types/contract.ts` — mirrors live-cell contract (v1.2/v1.3 §§1–13) |

Dashboard identity: Demo Mode + auth disabled → “Demo Operator”. Demo + Auth0 signed in → Auth0 name. Company in demo: “Demo Manufacturing (demo data)”.

---

## 4. Demo Mode versus Live Mode

Independent of auth. All four combinations are valid.

| `VITE_DEMO_MODE` | Behavior |
|---|---|
| `true` | DemoSource only. **Demo data** banner always on. Ack is local (`acknowledged_by` `"demo-operator"`). Explain hidden. Voice shown disabled: “Voice alerts require Live Mode”. No ElevenLabs, no browser TTS substitute. |
| `false` | LiveSource only. On failure: last known state + reconnecting/offline. Never substitutes synthetic data. |

| `VITE_AUTH_DISABLED` | Behavior |
|---|---|
| `true` | No Auth0 SDK login. Badge “Auth disabled (dev)”. Live Mode REST has no Bearer. WS sends no auth frame. Backend must also run `AUTH_DISABLED=true`. |
| `false` | Auth0 required for Live dashboard. Demo dashboard is still reachable without login (`ProtectedRoute` allows `demoMode`). REST sends Bearer. After WS open, client sends `{ "type": "auth", "token": "<access token>" }` within the contract window. |

Live bootstrap (`LiveSource`):

1. `GET /api/state` (Bearer if auth enabled).
2. Open `/ws`. Wait for `ready`, then `state`, then `event` / `alert` / `ping`.
3. Close **4401** → “auth configuration mismatch”. Close **4403** → no company access (`/access-denied` path / `NO_COMPANY_MESSAGE`).
4. Optimistic ack in `useFactoryStream`; rollback on API failure.

---

## 5. Auth0 configuration (names only, no secrets)

Frontend env names (also in `frontend/.env.example`):

| Variable | Role |
|---|---|
| `VITE_DEMO_MODE` | `true` \| `false` |
| `VITE_AUTH_DISABLED` | `true` \| `false` |
| `VITE_API_URL` | REST origin, required in Live |
| `VITE_WS_URL` | WebSocket URL, required in Live |
| `VITE_AUTH0_DOMAIN` | Tenant domain, required when auth enabled |
| `VITE_AUTH0_CLIENT_ID` | SPA Client ID only — **never** a Client Secret |
| `VITE_AUTH0_AUDIENCE` | Must be `https://factorypulse-api` |

Local values live in `frontend/.env` (gitignored). Copy from `.env.example`. Restart Vite after edits.

Dashboard setup already documented in `frontend/README.md`:

- Application type: **Single Page Application**, token endpoint auth **None**.
- Allowed Callback / Logout / Web Origins: `http://localhost:5173`.
- API identifier: `https://factorypulse-api`, RS256.
- SPA must be authorized to that API (User-Delegated Access / Authorized Applications).
- Access tokens stay in memory (`cacheLocation: "memory"`). Not `localStorage`.
- Logout `returnTo` is `http://localhost:5173`.

Backend env (Developer B, not in frontend): `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH_DISABLED`, `DEMO_AUTO_JOIN`. Identity key is JWT `sub`.

---

## 6. Auth0 verification — verified vs untested

**Verified in the browser (Demo + Auth0 enabled locally):**

- Vite starts with `VITE_AUTH_DISABLED=false` and SPA Domain / Client ID / Audience set in local `.env`.
- Landing “Get Started” / login “Continue with Auth0” calls `loginWithRedirect` with audience.
- First attempt failed with Auth0 “Client is not authorized to access that resource server”.
- After granting the SPA User-Delegated Access to API `https://factorypulse-api`, retry **302’d to Universal Login** (`/u/login`). Login form rendered.
- Credentials were **not** submitted (no test-user password in this session).

**Not verified:**

- Completing Universal Login (callback to `http://localhost:5173`).
- Session on `/dashboard`, Auth0 name in the header.
- `getAccessTokenSilently` producing an RS256 access token for `https://factorypulse-api`.
- Logout returning to `/` and clearing in-memory tokens.
- Live Mode + Auth0: `GET /api/me`, `GET /api/state` with Bearer, WS `{ type: "auth", token }`.
- Unknown-user 403 vs `DEMO_AUTO_JOIN`.
- Backend JWT validation (issuer, audience, expiry) — backend not exercised with a real token.

**Unit tests:** `LoginPage.test.tsx` mocks `getConfig()` with `authDisabled: true` so Vitest does not depend on the developer’s local Auth0 `.env`. It asserts no password field and “Continue to dashboard”.

---

## 7. ElevenLabs voice UI status

Implemented in the frontend. Wired to contract section 13.

- **Demo Mode:** VoiceButton disabled; label “Voice alerts require Live Mode”. No network, no browser TTS.
- **Live Mode:** `POST /api/alerts/{alert_id}/voice` via `api.requestBlob`. No request body. Spoken text is never sent from the client.
- `useAlertVoice`: one clip at a time; object-URL cache; maps 501 → “Voice alerts not configured on server” (disable), 502/504 → retryable, 404 → “Alert no longer available”.
- Tests: `useAlertVoice.test.ts` (5), `VoiceButton.test.tsx` (2).

**Not verified with real providers:** Gemini/ElevenLabs HTTP (keys unset on this machine). C-owned `backend/ai/` returns 501 when `GEMINI_API_KEY` / `ELEVENLABS_API_KEY`+`ELEVENLABS_VOICE_ID` are missing. Flags mean configuration presence, not a successful upstream call.

---

## 8. API / WebSocket integration and event-schema contract

Contract file: `docs/event-schema.md` **v1.3**. Frontend live-cell types: `src/types/contract.ts`. Console types: `src/console/types.ts`.

REST used by the SPA (Bearer unless auth disabled):

- `GET /api/me`
- `GET /api/state`
- `POST /api/alerts/{id}/ack`
- `POST /api/alerts/{id}/voice` (blob)
- `POST /api/alerts/{id}/explain` (hidden in Demo; gated on `explain_enabled`; 501 when Gemini unset)
- `GET /api/console/catalog` and other `/api/console/*` (only when `VITE_CONSOLE_HTTP=true`)

WS `/ws` messages: `ready`, `state`, `event`, `alert`, `ping`. Client may send only `{ "type": "auth", "token" }` when Auth0 is on. Deltas are ignored until `ready`. Extra top-level event fields are invalid on the wire; the client does not send `company_id`.

Unit coverage (mocked sockets/fetch): `api.test.ts`, `ws.test.ts`, `LiveSource.test.ts`, `streamReducer.test.ts`, `useFactoryStream.test.ts`, `DemoSource.test.ts`.

**Verified (no ESP32):** Live REST + `/ws` against in-repo FastAPI (`9ea53e4`). **Not verified:** ESP32 serial E2E; Console HTTP (B not shipped); Auth0 JWT on this FastAPI; Gemini/ElevenLabs routes.

---

## 9. Tests completed and known issues

Run from `frontend/` at this checkpoint:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass (also runs inside `npm run build`) |
| `npm test` (Vitest) | **40 passed / 10 files** |
| `npm run build` | Pass. Vite chunk-size warning: `index-*.js` ~833 kB (Auth0 SDK). Not a functional failure. |

Known issues / nits:

- React Router v7 future-flag warnings in Landing/Login tests (`v7_startTransition`, `v7_relativeSplatPath`). Harmless.
- Login page unit test covers auth-disabled path only, not Auth0 `loginWithRedirect`.
- Production bundle is large; code-splitting Auth0 is optional later, not required for the demo.
- Optional UX: surface Auth0 `error` query params on landing/login after a failed callback (not implemented as a verified flow).

---

## 10. Pending backend dependencies (Developer B)

Frontend is blocked on these for a live demo:

1. FastAPI on `:8000` with CORS for `:5173`.
2. Matching auth mode: `AUTH_DISABLED` equal to frontend `VITE_AUTH_DISABLED`.
3. Auth0 API + JWT validation (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE=https://factorypulse-api`), membership / `DEMO_AUTO_JOIN`.
4. Simulator (`SIM_ENABLED`) and/or sensor ingest from Developer A.
5. `GET /api/state` and `/ws` ready → state → deltas.
6. Ack + `ALERT_ACKNOWLEDGED` broadcast.
7. ElevenLabs env for voice 200; otherwise honest 501 `voice_not_configured`.
8. Optional Gemini for explain; otherwise 501 `explain_not_configured`.

Do not stub extra fields if the backend is not ready. Keep Demo Mode for UI demos.

---

## 11. Uncommitted or unfinished work

Intended frontend + this handoff were committed locally (see section 12).

Left **unstaged on purpose:**

- Root `package-lock.json` (untracked, not part of the frontend app). Do not add unless we decide to add a root npm workspace.

Gitignored (must stay out of Git):

- `frontend/.env`, `frontend/.env.local`
- `frontend/dist/`, `frontend/node_modules/`, `.DS_Store`, `*.log`

Unfinished product work (not in this commit as features):

- Full Auth0 login/logout with a test user.
- Live Mode E2E against backend.
- Voice/explain against real upstream.
- Optional Auth0 error query display on landing.

---

## 12. Git branch, commit, push status

Inspected from the working tree (do not assume this without `git status` / `git log`):

- Remote: `https://github.com/yjk82693/FactoryTetris.git`
- Branch: **`main`**
- **`origin/main`:** `40c1410` `feat(frontend): harden live mode and implement Auth0` (also on origin: `b77be50` P0 dashboard)
- **Feature checkpoint (frontend landing, Auth0 login UX, voice UI):** `2a0ecaf` (`2a0ecaf9ceb1ed7921cb6e7ffe130ee4e2d41b3e`)  
  `feat(frontend): add landing page, Auth0 integration, and voice controls`
- **Handoff file first landed in** `2a0ecaf`; hash note commit `b2a4c5d`. Further docs-only commits may exist on local `main`.
- **Push status: NOT pushed.** Local `main` is ahead of `origin/main`. Do not `git push` unless Yoojun asks.
- Tracked env templates only: `frontend/.env.example`. `frontend/.env` is gitignored. No Client Secret in the repo.
- Left untracked on purpose: root `package-lock.json` (empty npm lockfile, not the frontend app).

---

## 13. Recommended next tasks (priority)

1. **Create an Auth0 test user** and complete login: callback → `/dashboard`, header name, logout to `/`.
2. **Confirm silent token:** network tab shows no Client Secret; access token requested for audience `https://factorypulse-api`.
3. **Coordinate with B** for Live + auth-disabled first (`VITE_DEMO_MODE=false`, `VITE_AUTH_DISABLED=true`): `/api/state` + `/ws`, reconnect, ack.
4. **Then Live + Auth0:** Bearer + WS auth frame; 4401/4403; `/api/me`.
5. **Voice E2E** when B sets ElevenLabs: play/stop, 501 vs 200.
6. Optional: Auth0 error query on landing; Router v7 flags; Auth0 chunk split.
7. Push `main` only after Yoojun approves.

---

## How to continue (new chat)

Read this file, then inspect `frontend/` and `docs/event-schema.md`. Do not modify backend or the contract. Do not push. Ask before committing.
