# React OAuth2 PKCE Demo (Keycloak)

A tiny, well-commented React app showing the OAuth2 Authorization Code Flow with PKCE against Keycloak (or any OIDC/OAuth2 provider).

Goals:
- Minimal, readable React + TypeScript code
- Clear comments explaining each step of the flow
- Dockerized app and docker-compose to run with Keycloak locally

## What’s inside
- React + Vite app with a single page:
  - Login button that starts Authorization Code + PKCE
  - After redirect back, token exchange and user info fetch
  - Shows the user’s name/email and a Logout button
- Keycloak realm export with a SPA client: `react-oauth`
- Dockerfile and docker-compose.yml to run the app and Keycloak side-by-side

## Prerequisites
- Docker and Docker Compose
- macOS/Linux/Windows

## Quick start with Docker

1) Build and start everything:

```sh
docker compose up --build
```

- App: http://localhost:3001
- Keycloak Admin Console: http://localhost:8081 (admin / admin)

2) Create a user for the demo realm (don’t use admin/admin here)
  - Go to Keycloak Admin Console → Realm: demo → Users → Add user.
  - Set Username (e.g., student), Email (optional), Save.
  - Go to the Credentials tab → Set Password → enter a password (e.g., student) and toggle Temporary = Off → Save.

3) Login flow in the app
  - In the app, click “Login” and enter the user you created (e.g., student/student).
  - After login, you’ll be redirected back and the app will display your name/email.

3) Logout
- Click “Logout” to clear local tokens and sign out from Keycloak.

## Local development (Vite dev server)

1) Install dependencies:
```sh
npm install
```

2) Start Keycloak with docker-compose (only Keycloak):
```sh
docker compose up keycloak
```

3) Create a `.env` for Vite (optional, see `.env.example`):
```sh
cp .env.example .env
```

4) Run the dev server:
```sh
npm run dev
```

- App (dev): http://localhost:5173
- Keycloak: http://localhost:8081

Ensure the Keycloak client `react-oauth` has redirect URL `http://localhost:3001/*` and web origin `http://localhost:3001` for Docker; for Vite dev, use `http://localhost:5173/*` and origin `http://localhost:5173`.

## Configuration

The app reads configuration in two ways:

- Runtime (when Docker image runs): `config.js` is generated from environment variables by the container entrypoint.
  - PROVIDER_URL (e.g. http://keycloak:8080)
  - REALM (e.g. demo)
  - ISSUER (e.g. http://keycloak:8080/realms/demo)
  - CLIENT_ID (e.g. react-oauth)
  - REDIRECT_URI (e.g. http://localhost)
  - SCOPE (e.g. "openid profile email")

- Build-time (Vite dev): `.env` using VITE_* variables
  - VITE_PROVIDER_URL, VITE_REALM, VITE_CLIENT_ID, VITE_ISSUER, VITE_REDIRECT_URI, VITE_SCOPE

## Files to look at

- `src/oauth.ts` — Minimal PKCE flow implementation with comments
- `src/App.tsx` — UI wiring login, token exchange, userinfo, logout
- `public/config.js` — Default runtime config (overridden in Docker via env)
- `docker/docker-entrypoint.sh` — Writes `config.js` from env at container start
- `docker-compose.yml` — App + Keycloak
- `keycloak/realm-export/demo-realm.json` — realm with SPA client pre-configured

## Notes for teaching
- The flow uses Authorization Code with PKCE (never store a client secret in SPAs).
- Tokens are kept in sessionStorage to avoid long-lived storage (simple demo choice).
- We use OIDC Discovery to find endpoints dynamically from the issuer.

## Troubleshooting
- If login fails at token exchange, check the browser devtools network tab for the POST to the token endpoint.
- Make sure the redirect URI and web origins in Keycloak match the app URL.
- If Keycloak is slow to start, wait for it to be ready before attempting login.

## License
MIT