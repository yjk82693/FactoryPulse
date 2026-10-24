# FactoryPulse frontend

React + TypeScript dashboard for one simulated assembly cell. Data mode and authentication mode are independent, read once at startup, and never switched at runtime.

## Install

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

App: http://localhost:5173  
- `/` public landing page  
- `/login` Auth0 entry (or local continue when auth is disabled)  
- `/dashboard` assembly cell dashboard  
Backend (Live Mode): http://localhost:8000

```bash
npx tsc --noEmit
npm run build
npm test
```

## Environment variables

Names only. Values stay in local `.env` files. Never put backend secrets, database URLs, sensor keys, or ElevenLabs/Gemini keys in the frontend.

| Variable | Purpose |
|---|---|
| `VITE_DEMO_MODE` | `true` = local DemoSource only. `false` = LiveSource only. |
| `VITE_AUTH_DISABLED` | `true` = no Auth0. `false` = Auth0 login required. |
| `VITE_API_URL` | REST origin, required in Live Mode. Example: `http://localhost:8000` |
| `VITE_WS_URL` | WebSocket URL, required in Live Mode. Example: `ws://localhost:8000/ws` |
| `VITE_AUTH0_DOMAIN` | Auth0 domain, required when auth is enabled. |
| `VITE_AUTH0_CLIENT_ID` | Auth0 SPA client id, required when auth is enabled. |
| `VITE_AUTH0_AUDIENCE` | Auth0 API audience. Use `https://factorypulse-api`. |

## Four mode combinations

Flags are independent. Restart the dev server after changing `.env`.

### 1. Demo + auth disabled (default local development)

```
VITE_DEMO_MODE=true
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

No requests are made to the API or WebSocket. A **Demo data** banner stays visible. Identity is Demo Operator.

### 2. Demo + Auth0

```
VITE_DEMO_MODE=true
VITE_AUTH_DISABLED=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://factorypulse-api
```

Get Started uses Auth0. Explore Demo opens `/dashboard` without login. Data still comes only from the local demo source. If the operator signs in, the header uses the Auth0 user name.

### 3. Live + auth disabled

Backend must also run `AUTH_DISABLED=true`.

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=true
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

Uses `GET /api/state` then `/ws`. On disconnect the UI keeps the last known state and shows reconnecting/offline. It never substitutes demo data.

### 4. Live + Auth0

Backend must run `AUTH_DISABLED=false` with matching Auth0 settings.

```
VITE_DEMO_MODE=false
VITE_AUTH_DISABLED=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://factorypulse-api
```

REST calls send a Bearer token. After the WebSocket opens, the client sends `{ "type": "auth", "token": "<access token>" }`.

## Auth0 Dashboard setup (Developer C)

Do this in the Auth0 Dashboard. Do not put a Client Secret in `.env`.

1. Create or use a tenant. Note the domain, for example `your-tenant.us.auth0.com`.
2. **Applications → Create Application**
   - Name: `FactoryPulse SPA`
   - Type: **Single Page Application**
   - Token Endpoint Authentication Method: **None**
3. Application settings:
   - Allowed Callback URLs: `http://localhost:5173`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`
   - Application Login URI (optional): `http://localhost:5173/login`
4. Copy **Domain** and **Client ID** into local `frontend/.env` as `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID`. Restart `npm run dev`.
5. **Applications → APIs → Create API**
   - Name: `FactoryPulse API`
   - Identifier: `https://factorypulse-api` (this is `VITE_AUTH0_AUDIENCE` / backend `AUTH0_AUDIENCE`)
   - Signing algorithm: **RS256**
6. Enable Universal Login. Create a test user if the tenant has no connections yet (Username-Password or a social connection).
7. For local Auth0 UI testing: `VITE_DEMO_MODE=true` and `VITE_AUTH_DISABLED=false`. Explore Demo still works without login. Get Started / Continue with Auth0 exercises Universal Login.

Frontend redirect_uri is `window.location.origin` (`http://localhost:5173`). After login, the app navigates to `/dashboard`. Logout `returnTo` is `http://localhost:5173`. Access tokens stay in memory; they are not written to localStorage.

Prototype only: the machine is simulated. Wi-Fi CSI activity is an operational observation, not certified safety monitoring.
