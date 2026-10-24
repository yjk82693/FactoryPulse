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

Login is required. Data still comes only from the local demo source. Company is shown as Demo Manufacturing (demo data). Identity uses the Auth0 user name.

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

## Auth0 application settings

Create a **Single Page Application**.

- Allowed callback URLs: `http://localhost:5173`
- Allowed logout URLs: `http://localhost:5173`
- Allowed web origins: `http://localhost:5173`
- API audience: `https://factorypulse-api`

Prototype only: the machine is simulated. Wi-Fi CSI activity is an operational observation, not certified safety monitoring.
