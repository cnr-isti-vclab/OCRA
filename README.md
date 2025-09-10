# Ocra min
a minimal ## Prerequisites
- Docker and Docker Compose
- macOS/Linux/Windows## What's inside
- React 19 + Vite app with routing:
  - Home page: starts Authorization Code + PKCE login, handles redirect/exchange, Logout
  - Protected Profile page: only accessible when logged in; shows user info from database
- **Database integration with Prisma:**
  - PostgreSQL database for storing user sessions and profiles
  - Secure session management (tokens stored server-side, only session ID in browser)
  - Login audit logging and session cleanup
  - Browser-compatible demo simulation (for frontend-only testing)
- Keycloak realm export with a SPA client: `react-oauth`
- Dockerfile and docker-compose.yml to run the app, database, and Keycloak together
- Minimal, readable React + TypeScript code
- Clear comments explaining each step of the flow

## What is PKCE?

**PKCE** (Proof Key for Code Exchange, pronounced "pixie") is a well-established OAuth2 security standard (RFC 7636) that prevents authorization code interception attacks. Instead of using a static client secret (which can't be safely stored in public clients like SPAs), PKCE generates a random code verifier and sends its hash during authorization. This ensures only the app that initiated the flow can exchange the authorization code for tokens. PKCE is widely supported by all major OAuth2 providers and is now the recommended approach for public clients.

## What's insideuth2 PKCE Demo (Keycloak)

A tiny, well-commented React 19 app showing the OAuth2 Authorization Code Flow with PKCE against Keycloak (or any OIDC/OAuth2 provider).

Goals:
- Minimal, readable React + TypeScript code
- Clear comments explaining each step of the flow
- Dockerized app and docker-compose to run with Keycloak locally

## What’s inside
- React 19 + Vite app with routing:
  - Home page: starts Authorization Code + PKCE login, handles redirect/exchange, Logout
  - Protected Profile page: only accessible when logged in; shows name/email from userinfo
- Keycloak realm export with a SPA client: `react-oauth`
- Dockerfile and docker-compose.yml to run the app and Keycloak side-by-side

## Prerequisites
- Docker and Docker Compose
- macOS/Linux/Windows

## Quick start with Docker

1) Build and start everything (includes backend API server):

```sh
docker compose up --build
```

- **App**: http://localhost:3001
- **Backend API**: http://localhost:3002 (session management)
- **Keycloak Admin Console**: http://localhost:8081 (admin / admin)
- **PostgreSQL**: http://localhost:5432 (oauth_demo database)

2) Create a user for the demo realm (don’t use admin/admin here)
  - Go to Keycloak Admin Console → Realm: demo → Users → Add user.
  - Set Username (e.g., student), Email (optional), Save.
  - Go to the Credentials tab → Set Password → enter a password (e.g., student) and toggle Temporary = Off → Save.

3) Login flow in the app
  - In the app, click “Login” and enter the user you created (e.g., student/student).
    - After login, you’ll be redirected back and the app will display your name/email.
    - Tip: Open the “Profile” page (protected route) to see the user info fetched from the userinfo endpoint.

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

- App (dev): http://localhost:5173 (Vite)
- Keycloak: http://localhost:8081

**Important**: The Keycloak client `react-oauth` needs both redirect URIs configured:
- For Docker: `http://localhost:3001/*` and web origin `http://localhost:3001`
- For Vite dev: `http://localhost:5173/*` and web origin `http://localhost:5173`

If you get "Invalid parameter: redirect_uri" errors during login, check that both URLs are configured in Keycloak Admin Console → Realm: demo → Clients → react-oauth → Valid redirect URIs.

## Configuration

The app reads configuration in two ways:

- Runtime (when Docker image runs): `config.js` is generated from environment variables by the container entrypoint.
  - PROVIDER_URL (e.g. http://localhost:8081)
  - REALM (e.g. demo)
  - ISSUER (e.g. http://localhost:8081/realms/demo)
  - CLIENT_ID (e.g. react-oauth)
  - REDIRECT_URI (e.g. http://localhost:3001)
  - SCOPE (e.g. "openid profile email")

- Build-time (Vite dev): `.env` using VITE_* variables
  - VITE_PROVIDER_URL, VITE_REALM, VITE_CLIENT_ID, VITE_ISSUER, VITE_REDIRECT_URI, VITE_SCOPE
  - DATABASE_URL for PostgreSQL connection
  - See `.env.example` for commented defaults matching the dev setup.

## Database Integration

This demo now includes **Prisma + PostgreSQL** for secure session management:

**Security Benefits:**
- OAuth tokens stored server-side in database (not in browser sessionStorage)
- Session expiry handled server-side
- Audit logging of login attempts
- Automatic cleanup of expired sessions

**Database Models:**
- **Users**: OAuth profile information (sub, email, name)
- **Sessions**: Access tokens, refresh tokens, expiry times
- **LoginEvents**: Audit log of authentication attempts

**Demo Implementation:**
- Uses `src/db-browser.ts` for browser-compatible simulation (localStorage)
- Real implementation would use `src/db.ts` with Prisma Client in a Node.js backend
- Database schema defined in `prisma/schema.prisma`

## Files to look at

**Core OAuth + Database:**
- `src/oauth-backend.ts` — PKCE flow with backend API session storage
- `src/db-browser.ts` — Browser simulation of database operations (legacy)
- `src/db.ts` — Real Prisma database operations (for backend use)
- `backend/server.js` — Express.js backend API server
- `backend/db.js` — Backend database operations
- `prisma/schema.prisma` — Database schema definition

**React Components:**
- `src/App.tsx` — UI wiring login, token exchange, session management
- `src/main.tsx` — Router setup (home and protected profile)
- `src/routes/Profile.tsx` — Protected page showing user data from database
- `src/routes/RequireAuth.tsx` — Route guard with async session validation

**Infrastructure:**
- `public/config.js` — Default runtime config (overridden in Docker via env)
- `docker/docker-entrypoint.sh` — Writes `config.js` from env at container start
- `docker-compose.yml` — App + PostgreSQL + Keycloak
- `keycloak/realm-export/demo-realm.json` — realm with SPA client pre-configured

## Notes for teaching
- The flow uses Authorization Code with PKCE (never store a client secret in SPAs).
- **Security Enhancement**: Tokens are now stored in a database instead of browser sessionStorage.
- Only a session ID is stored in sessionStorage, tokens remain server-side for better security.
- We use OIDC Discovery to find endpoints dynamically from the issuer.
- Database integration demonstrates production-ready session management patterns.

## Troubleshooting
- If login fails at token exchange, check the browser devtools network tab for the POST to the token endpoint.
- Make sure the redirect URI and web origins in Keycloak match the app URL (check ports 3001, 5173, 5174).
- If database connection fails, ensure PostgreSQL is running: `docker compose up postgres`
- If Keycloak is slow to start, wait for it to be ready before attempting login.
- On newer Keycloak versions, `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` are deprecated. If you run into issues, set `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` instead in `docker-compose.yml`.
- Check browser console for database simulation logs (prefixed with `[DEMO]`).

## License
MIT