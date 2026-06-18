# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OCRA

OCRA is a collaborative platform for annotation and management of 3D assets. It is developed within the ECHOES project. Users can view 3D models, add geometric annotations, and manage project members with role-based access.

## Architecture

**npm workspaces** at the repo root (`frontend`, `backend`, `shared`). All `npm run` commands can be issued from the root.

| Layer | Stack | Port |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite, Bootstrap 5 | 3001 |
| Backend | Node.js + Express, TypeScript via `tsx` | 3002 |
| Auth | Keycloak (OAuth2 PKCE) | 8081 |
| App DB | PostgreSQL 15 + Prisma ORM | 5432 |
| Content/Audit DB | MongoDB 8 (replica set `rs0`) | 27017 |

### Data stores and what lives where

**PostgreSQL (Prisma schema at `backend/prisma/schema.prisma`):** users, sessions, projects, project roles, structuring locks, presence leases, vocabularies.

**MongoDB — two logical databases:**
- `ocra_audit`: audit events (login/logout/file uploads). Repository: `backend/src/repositories/audit.repository.ts`.
- `ocra_content`: annotation data in three collections — `annotation_geometry`, `annotation_data`, `annotation_link`. Repositories in `backend/src/repositories/annotation-*.repository.ts`.

Annotations are **not** in PostgreSQL. The Prisma client is only used in annotation code to enrich documents with user/project info.

### Annotation data model (`shared/`)

Three separate MongoDB entities per annotation:
- **Geometry** — 3D shapes (ShapePoints / ShapePolyline / ShapePolygon) scoped to a `scene` or `asset` via `referenceType`+`referenceId`.
- **Data** — text, vocabulary terms, metadata.
- **Link** — many-to-many join between geometry and data.

All three entities carry a `version` field for **OCC (Optimistic Concurrency Control)** and `erasableAt`/`erasableBy` for soft-delete. The canonical Zod schemas live in `shared/annotation-schema.ts`; TypeScript types in `shared/annotation-types.ts`.

### Real-time events

**SSE (Server-Sent Events)** — no WebSockets. Two independent event buses:
- **Annotation events** (`backend/src/lib/annotation-events.ts`): mutation broadcasts + in-memory social locks (presence/editor) keyed by project+scene+resource.
- **Structuring events** (`backend/src/lib/structuring-events.ts`): broadcasts when the project-structuring lock state changes.

The **structuring lock** is database-backed (`StructuringLock` table) with a heartbeat TTL of 30 s and a `draining` → `exclusive` state machine. Frontend coordinator: `frontend/src/services/ProjectStructuringCoordinator.ts`.

### Authorization model

System-level flags on the `User` model: `sys_admin` (full access), `sys_creator` (can create projects).

Per-project roles (`ProjectRole` table): `manager` | `editor` | `viewer`.

Auth middleware (`backend/src/middleware/auth.ts`) resolves the session cookie → Prisma user → `req.user`. In `NODE_ENV=test`, the `X-Test-User-Id` header bypasses full OAuth for integration tests.

### Static file serving

Project files (3D models, RTI images) are served at `/assets/projects/<projectId>/…` from `PROJECT_FILES_PATH` (default: `/app/project_files`).

---

## Development commands

### Option A — Full Docker Compose (recommended for first run)

```bash
# Production-style, no source mounts
docker compose up --build -d app

# Hot-reload dev with source bind-mounts
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

### Option B — Bare services + local processes

```bash
# Start Postgres, Mongo, Keycloak as standalone Docker containers
npm run services:start        # script: scripts/start-services.sh

# Run backend and frontend locally (separate terminals)
npm run dev:backend           # cd backend && tsx watch server.ts
npm run dev:frontend          # cd frontend && vite
```

### Database

```bash
npm run db:migrate            # prisma migrate dev (requires DATABASE_URL)
npm run db:generate           # prisma generate after schema changes
npm run db:studio             # Prisma Studio UI
npm run db:reset              # prisma migrate reset --force
```

After editing `backend/prisma/schema.prisma`, always run `npm run db:generate`.

### Testing

Tests require running Postgres and Mongo. Use `npm run services:start` to bring them up.

```bash
# Run the full e2e suite (from root or backend/)
npm test

# Single test file
cd backend && npx vitest run src/test/project-concurrency.api.test.ts

# Watch mode / UI
npm run test:watch
npm run test:ui

# Coverage
npm run test:coverage
```

Test databases: `ocra_test` (Postgres) and `ocra_audit_test` / `ocra_content_test` (Mongo). Configuration is in `backend/.env.test`. The global setup (`backend/src/test/setup.ts`) loads `.env.test` and auto-runs Prisma migrations before the suite.

All tests run **sequentially** (`singleFork: true` in `backend/vitest.config.ts`) to avoid DB conflicts. Use `describe.sequential` in new test files.

### Misc

```bash
npm run logs                  # docker compose logs -f
npm run services:stop         # stop bare service containers
npm run mongo:init            # bootstrap Mongo collections
npm run project-files:cleanup # remove orphan files from project_files/
```

---

## Key environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | postgres://postgres:postgres@postgres:5432/oauth_demo | Prisma / PostgreSQL |
| `MONGO_URL` | mongodb://mongodb:27017/?replicaSet=rs0 | MongoDB connection |
| `MONGO_AUDIT_DB` | ocra_audit | Audit events database |
| `MONGO_CONTENT_DB` | ocra_content | Annotation content database |
| `ISSUER` | http://localhost:8081/realms/demo | Keycloak realm URL |
| `CLIENT_ID` | react-oauth | Keycloak client |
| `CORS_ORIGINS` | http://localhost:3001 | Comma-separated allowed origins |
| `PROJECT_FILES_PATH` | /app/project_files | Static asset root |
| `SYS_ADMIN_EMAIL` | admin@ocra.it | Seeded system admin email |

Swagger API docs are available at `http://localhost:3002/api-docs` when the backend is running.

## Instructions for Claude Code

When working on this codebase, please adhere to the following principles (if existsing, otherwise use your best judgment):
AGENTS.md
