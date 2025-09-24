# OCRA
OCRA is a small full-stack platform for collaborative annotation and management of 3D assets.

## Architecture (short)
- Frontend: React + TypeScript (Vite), Bootstrap UI — dev server on `:3001`.
- Backend: Node.js + Express; Prisma + PostgreSQL for application data (users, sessions, projects) — API on `:3002`.
- Audit store: **MongoDB 8.0** (audit events including login/logout/file uploads stored in Mongo collection). Backend uses Prisma only to enrich audit documents with user info (read-only).
- Authentication: OAuth2 PKCE (Keycloak). Realm exports under `keycloak/realm-export/`.

## Run (quick)
1. Clone and enter repo:
```bash
git clone <repo-url>
cd OCRA
```
2. Start services with Docker Compose:
```bash
docker compose up --build -d app
```
3. Open the app:
  - Frontend: `http://localhost:3001`
  - Backend API: `http://localhost:3002`

Notes:
- Audit logs (login/logout/file uploads) are stored in MongoDB; all authenticated users can view audit events (filtered by permissions).
- If you change the Prisma schema, run `npx prisma generate` in `backend/` to regenerate the client.
- For local development without Docker, use the `frontend` and `backend` package.json scripts directly.
 
- For more details on development vs production workflows and the compose override, see `devel.md`.

