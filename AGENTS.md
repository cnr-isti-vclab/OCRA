# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What is OCRA

OCRA is a collaborative platform for annotation and management of 3D assets. It is developed within the ECHOES project. Users can view 3D models, add geometric annotations, and manage project members with role-based access.

## Architecture

**npm workspaces** at the repo root (`frontend`, `backend`, `shared`). All `npm run` commands can be issued from the root.

| Layer | Stack | Port |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite, Bootstrap 5 | 3001 |
| Backend | Node.js + Express, TypeScript via `tsx` | 3002 |
| Auth | EGI Check-in (OIDC Authorization Code + PKCE) | external |
| App DB | PostgreSQL 15 + Prisma ORM | 5432 |
| Content/Audit DB | MongoDB 7 (replica set `rs0`) | 27017 |

### Data stores and what lives where

**PostgreSQL (Prisma schema at `backend/prisma/schema.prisma`):** users, sessions, projects, project roles, structuring locks, presence leases, vocabularies.

**MongoDB — two logical databases:**
- `ocra_audit`: audit events (login/logout/file uploads). Repository: `backend/src/repositories/audit.repository.ts`.
- `ocra_content`: the per-project **HDT document** (`hdt_collection`, one per `projectId` — physical-object metadata, digital assets, scenes, ECHOES context; repository `hdt.repository.ts`), plus annotation data in three collections — `annotation_geometry`, `annotation_data`, `annotation_link` (repositories in `backend/src/repositories/annotation-*.repository.ts`).

Annotations are **not** in PostgreSQL. The Prisma client is only used in annotation code to enrich documents with user/project info.

### Annotation data model (`shared/`)

Three separate MongoDB entities per annotation:
- **Geometry** — 3D shapes (ShapePoints / ShapePolyline / ShapePolygon) scoped to a `scene` or `asset` via `referenceType`+`referenceId`.
- **Data** — text, vocabulary terms, metadata.
- **Link** — many-to-many join between geometry and data.

All three entities carry a `version` field for **OCC (Optimistic Concurrency Control)** and `erasableAt`/`erasableBy` for soft-delete. The canonical Zod schemas live in `shared/annotation-schema.ts`; TypeScript types in `shared/annotation-types.ts`.

### Real-time events

**SSE (Server-Sent Events)** — no WebSockets. Three independent event buses:
- **Annotation events** (`backend/src/lib/annotation-events.ts`): mutation broadcasts + in-memory social locks (presence/editor) keyed by project+scene+resource.
- **Structuring events** (`backend/src/lib/structuring-events.ts`): broadcasts when the project-structuring lock state changes.
- **Project catalog events** (`backend/src/lib/project-catalog-events.ts`): `project.catalog.created|updated|deleted`, so sidebars and project lists refresh.

The **structuring lock** is database-backed (`StructuringLock` table) with a heartbeat TTL of 30 s and a `draining` → `exclusive` state machine. Frontend coordinator: `frontend/src/services/ProjectStructuringCoordinator.ts`.

### Authorization model

System-level flags on the `User` model: `sys_admin` (full access), `sys_creator` (can create projects).

Per-project roles (`ProjectRole` table): `manager` | `editor` | `viewer`.

Auth middleware (`backend/src/middleware/auth.ts`) resolves the session cookie → Prisma user → `req.user`. In `NODE_ENV=test`, the `X-Test-User-Id` header bypasses full OAuth for integration tests.

### Static file serving

Project files (3D models, RTI images) are served at `/assets/projects/<projectId>/…` from `PROJECT_FILES_PATH` (default: `/app/project_files`).

### API surface and external integrations

`createApp()` mounts the API router at `/api` (see `backend/src/routes/index.ts`); `/health`, `/ready` and the static `/assets/projects` sit outside it.

| Prefix | Purpose |
|---|---|
| `/api/projects` | Projects, HDT metadata (`/:id/hdt`), annotations (`/:id/annotations`), concurrency |
| `/api/users`, `/api/admin`, `/api/sessions`, `/api/oauth` | Accounts, administration, auth |
| `/api/eccch` | ECHOES knowledge base — two-way: create or enrich a project from an ECHOES HDT/RDF twin, push back, delete |
| `/api/arco`, `/api/wikidata`, `/api/europeana` | Read-only `search` + `detail` lookups for sourcing physical-object metadata |
| `/api/vocabularies` | Stored vocabularies (CRUD) and external providers (`/:providerId/search`, concept broader/narrower) |
| `/api/sparql-proxy` | SPARQL pass-through for the HDT/ECHOES side |
| `/api/vocabulary` | `@spike` (`vocabulary-concepts.routes.ts`) — scheduled for removal, do not build on it |

### Viewer submodules

Two git submodules under `frontend/`, both checked out on their own branch:

- `frontend/openlime` — OpenLIME 2D/RTI viewer, branch `ocra-integration`. OCRA-side glue: `frontend/src/adapters/openlime-viewer/`.
- `frontend/three-presenter` — ThreePresenter 3D viewer, branch `devel`, with its own `AGENTS.md`. OCRA-side glue: `frontend/src/adapters/three-presenter/`.

What may and may not be changed inside each one is stated under *Instructions for Agents* at the end of this file.

Both must be built before Vite can resolve them, and again after every submodule update, or the dev server fails with *"Failed to resolve entry for package openlime"*:

```bash
npm run build:openlime          # also: npm run update:openlime
npm run build:three-presenter   # also: npm run update:three-presenter
```

### Code conventions

**Backend** — `routes/*.routes.ts` → `controllers/*.controller.ts` → `services/*.service.ts` → `repositories/*.repository.ts`.

- Every import carries the `.js` extension (strict ESM), even when importing `.ts` sources.
- Filenames are `kebab-case` with the suffixes `.routes.ts`, `.controller.ts`, `.service.ts`, `.middleware.ts`, `.repository.ts`.
- `createApp()` in `backend/src/app.ts` returns a configured, testable Express instance.
- Routes carry Swagger JSDoc annotations.

**Frontend** — `routes/` (pages) → `components/` (shared UI) → `services/` (API calls) → `adapters/` (viewer integrations).

- Auth shell and PKCE redirect handling in `App.tsx`; API client and OAuth logic in `frontend/src/backend.ts`.
- Domain-scoped code under `features/`, viewer integrations under `adapters/`, annotation state in `stores/`.

**Shared** — `shared/types.ts` and `shared/scene-types.ts` are the API contract between front and back: extend them rather than redeclaring types on either side.

`projectId` (the PostgreSQL `Project.id`) is the bridge key across PostgreSQL, MongoDB and the `project_files/` path segment.

### Documentation

Domain documentation is indexed in [`doc/README.md`](doc/README.md). `doc/outdated_docs/` is superseded — ignore it. `internaldoc/` holds project deliverables, not code guidance.

---

## Development commands

### Option A — Full Docker Compose (recommended for first run)

```bash
# Whole stack. Compose auto-loads docker-compose.override.yml, which publishes
# the host ports. Authentication uses EGI Check-in Demo. No source mounts, no hot-reload:
# the frontend is a built dist/ served by Nginx.
cp .env.egi-demo.example .env.egi-demo # then set CLIENT_SECRET
docker compose --env-file .env.egi-demo up --build -d app

# Same stack minus the `app` container, for native Vite HMR on :3001 (see DEVELOPMENT.md).
# EGI Check-in must be reachable because backend readiness checks OIDC discovery.
docker compose --env-file .env.egi-demo up --build backend
npm run dev:frontend
```

The local client secret belongs only in the ignored `.env.egi-demo` file.

### Option B — Bare services + local processes

```bash
# Start Postgres and Mongo as standalone Docker containers
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

There are two tiers. Pure unit tests need no databases; everything under `backend/src/test/` needs Postgres and Mongo running (`npm run services:start`).

```bash
# Unit tier — no DB required (shared/, frontend stores, features, utils, adapters)
npm run test:unit

# Root script: only the comprehensive workflow e2e file
npm test

# Full suite (all of backend/src/test/)
cd backend && npm test

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

The unit tier is driven by `vitest.unit.config.ts` at the repo root, whose `include` is a **hand-maintained allowlist**: a new DB-free test file is silently never run until its path is added there.

### Misc

```bash
npm run logs                  # docker compose logs -f
npm run services:stop         # stop bare service containers
npm run mongo:init            # bootstrap Mongo collections
npm run project-files:cleanup # remove orphan files from project_files/
```

`cd backend && npm run project:package:export` / `:import` move a whole project (databases plus `project_files/`) between environments — see [`backend/doc/project-backup-and-restore.md`](backend/doc/project-backup-and-restore.md). From the root, `npm run project:inspect` dumps one project by id through the `backend` container, `npm run project:inspect:bare` against local services.

`backend/seed.ts` (`cd backend && npm run seed`) is the authoritative idempotent demo seed for PostgreSQL, MongoDB and `project_files`; it is opt-in and needs an existing EGI-authenticated manager. MongoDB must run as the single-node replica set `rs0` in every setup — re-run `npm run mongo:init` whenever its volumes are reset.

---

## Key environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | postgres://postgres:postgres@postgres:5432/oauth_demo | Prisma / PostgreSQL |
| `MONGO_URL` | mongodb://mongodb:27017/?replicaSet=rs0 | MongoDB connection |
| `MONGO_AUDIT_DB` | ocra_audit | Audit events database |
| `MONGO_CONTENT_DB` | ocra_content | Annotation content database |
| `ISSUER` | https://aai-demo.egi.eu/auth/realms/egi | EGI Check-in Demo issuer |
| `CLIENT_ID` | b5998dc7-d012-4e12-a800-16e3bdf3d3c5 | Shared OCRA development client |
| `CORS_ORIGINS` | http://localhost:3001 | Comma-separated allowed origins |
| `PROJECT_FILES_PATH` | /app/project_files | Static asset root |
| `SYS_ADMIN_EMAIL` | admin@ocra.it | Seeded system admin email |

Swagger API docs are available at `http://localhost:3002/api-docs` when the backend is running.

## Instructions for Agents

When working on this codebase, please adhere to the following principles:

Remember that I really prefer to avoid code bloating. I always prefer solutions that need less code with respect to ones that are implemented in more code. In particular, I do not want duplication of code or functionalities. Also check always for leftover files and functions and ask for their removal. 
The less code you write the better it is. If sometimes I ask you something whose implementation requires you to write a lot of new code, please warn me before starting and, if possible, suggest solutions that would require less code.  Also always look for leftovers, like files or functions that are no more used.

It's not possible to modify directly the code for OpenLIME. Any changes or customizations should be done through configuration or by extending their functionality externally. You can suggest a prompt in English to be given to these systems for generating the desired behavior.
Changes to the ThreePresenter submodule can be done directly, but you should take care that the changes are sound in the logic of an independent module. Any modifications should not break its standalone functionality and should be well-documented. No dependency from the main OCRA codebase should be introduced and all the changes should be self-contained and make sense within the submodule.
