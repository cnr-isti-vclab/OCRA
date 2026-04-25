# Annotation Integration Guide

## Purpose

This document has two goals:

- explain the two supported development modes for OCRA
- explain how the frontend should interact with the annotation backend

The first part is operational and focuses on local development, database reset, and database population.

The second part keeps the frontend integration notes for annotations.

## Development Modes

For development, OCRA can be used in two ways:

- non-bare: the full stack runs through Docker Compose
- bare: PostgreSQL, MongoDB, and Keycloak run through the local helper services, while frontend and backend run directly from the workspace

### Non-Bare Development

Use Docker Compose when you want the whole application stack managed inside containers.

Start the development stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
```

Stop it:

```bash
docker compose down
```

This mode is the simplest one when you want backend, frontend, PostgreSQL, MongoDB, and Keycloak all aligned inside the same containerized environment.

### Bare Development

Use the bare mode when you want databases and Keycloak managed by helper services, but backend and frontend executed directly from the local workspace.

Start the local services:

```bash
npm run services:start
```

Start backend and frontend from the workspace:

```bash
npm run dev:backend
npm run dev:frontend
```

Stop the local services when done:

```bash
npm run services:stop
```

This mode gives you faster iteration on backend and frontend code while keeping PostgreSQL, MongoDB, and Keycloak available through the local service containers.

## Resetting OCRA Databases

The commands below reset both PostgreSQL and MongoDB for development.

### Reset Non-Bare Databases

Use this when you want to wipe the Docker Compose PostgreSQL and MongoDB state and recreate them from scratch.

```bash
docker compose down -v
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
npm run db:migrate:compose
npm run mongo:init
docker compose down
```

What this does:

- removes Compose containers and volumes
- recreates PostgreSQL and MongoDB
- reapplies the Prisma schema for the Compose database
- reinitializes MongoDB collections and replica set
- shuts the stack down again so you can restart it cleanly when needed

### Reset Bare Databases

Use this when you want to wipe the bare PostgreSQL and MongoDB state and recreate the local service containers from scratch.

```bash
npm run services:stop
docker rm -f bare-ocra-postgres bare-ocra-mongo bare-keycloak 2>/dev/null || true
docker volume rm ocra-postgres-data ocra-mongo-data 2>/dev/null || true
bash scripts/start-services.sh
npm run db:migrate:bare
npm run services:stop
```

What this does:

- stops the bare local services
- removes the bare PostgreSQL, MongoDB, and Keycloak containers
- removes the named PostgreSQL and MongoDB volumes
- recreates the local service containers
- reapplies the Prisma schema for the bare database
- leaves the services stopped at the end

If MongoDB already exists but only needs to be reinitialized, you can also run:

```bash
npm run mongo:init -- bare-ocra-mongo
```

## Populating the Databases

There are two different population steps to keep in mind:

- base demo seed: users, vocabulary, at least one demo project, project files, HDT document, and audit trail
- annotation seed: geometry/data/link demo annotations for a specific project

### Base Demo Seed

The base seed is driven by:

```bash
cd backend
npm run seed
```

What it populates:

- PostgreSQL users and roles
- PostgreSQL vocabulary data
- at least one demo project in PostgreSQL
- project files under `project_files/`
- HDT content in MongoDB
- audit data in MongoDB

In Compose development, some of this may already happen during container startup depending on the environment. If you want an explicit and repeatable population step, run the seed manually.

For non-bare:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
docker compose exec backend npm run seed
```

For bare:

```bash
npm run services:start
cd backend
npm run seed
```

### Annotation Seed for a Specific Project

The annotation seed is driven by:

```bash
cd backend
npm run seed:annotation -- <projectId>
```

This script writes annotation documents into MongoDB for the selected project. In the current test dataset it creates:

- 2 geometries
- 1 annotation data record
- 2 links

Use it after the base seed, once you have a valid `projectId`.

For non-bare:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
docker compose exec backend npm run seed:annotation -- <projectId>
```

For bare:

```bash
npm run services:start
cd backend
npm run seed:annotation -- <projectId>
```

## Recommended Frontend Model

Keep three client-side maps keyed by id:

- `geometriesById`
- `dataById`
- `linksById`

And optionally one derived structure for rendering:

- `resolvedAnnotations = links.map(link => ({ geometry, data, link }))`

This matches the backend decomposition.

## Authentication and Authorization

All annotation endpoints require authentication.

Read endpoints require project role:

- `viewer`
- `editor`
- `manager`

Write endpoints require:

- `editor`
- `manager`

## First Load: Scene Bundle

The primary frontend entry point should be:

```http
GET /api/projects/{projectId}/annotations/for-scene/{sceneId}
```

Optional query parameter:

- `includeErasable=true`

Typical response:

```json
{
  "success": true,
  "geometries": [ ... ],
  "data": [ ... ],
  "links": [ ... ]
}
```

Recommended usage:

1. call the scene bundle route when entering the annotation view
2. normalize arrays into id-keyed maps
3. derive renderable annotation triples from `links`

## Create Flows

### Create Geometry

```http
POST /api/projects/{projectId}/annotations/geometry
```

Request example:

```json
{
  "shapes": [
    {
      "type": "ShapePolygon",
      "vertices": [[0,0,0],[1,0,0],[1,1,0]]
    }
  ],
  "referenceType": "scene",
  "referenceId": "scene-main"
}
```

### Create Data

```http
POST /api/projects/{projectId}/annotations/data
```

Request example:

```json
{
  "label": "Crack",
  "description": "Visible crack on lower edge",
  "class": "damage",
  "content": { "severity": "medium" },
  "visibilityType": "scene",
  "visibilityId": "scene-main"
}
```

### Create Link

```http
POST /api/projects/{projectId}/annotations/links
```

Request example:

```json
{
  "geometryId": "ag_123",
  "dataId": "ad_456"
}
```

Frontend recommendation:

- create geometry and data independently if your UI edits them independently
- create the link only after both ids exist

## Update Flows and OCC

Every mutable update must send the current `expectedVersion`.

Example:

```http
PUT /api/projects/{projectId}/annotations/geometry/{geometryId}
```

```json
{
  "expectedVersion": 3,
  "shapes": [ ... ]
}
```

On successful mutation:

- replace local `version` with the returned version
- or reload the entity or scene bundle

On `409`:

- treat it as an OCC conflict or invalid state transition
- show a user-visible conflict message
- refresh the entity or the whole scene bundle

## Erasable and Restore Workflows

### Mark Geometry or Data Erasable

Implemented backend behaviour:

- marking a geometry erasable also marks its connected non-erasable links erasable in the same MongoDB transaction
- marking a data record erasable also marks its connected non-erasable links erasable in the same MongoDB transaction

Frontend implication: after one of these calls, reloading the scene bundle is usually safer than patching only one local entity.

### Restore Geometry or Data to Non-Erasable

Implemented backend behaviour:

- restoring geometry may restore only those connected links whose data endpoint is already non-erasable
- restoring data may restore only those connected links whose geometry endpoint is already non-erasable

### Restore Link to Non-Erasable

Important implementation detail:

- restoring a link does **not** restore geometry or data
- it succeeds only if both endpoints already exist and are already non-erasable

So the frontend restore order is:

1. if geometry is erasable, restore geometry first
2. if data is erasable, restore data first
3. restore the link last

## Error Handling

### Two Error Shapes Exist Today

Annotation endpoints currently return two families of errors.

Structured envelope example:

```json
{
  "success": false,
  "error": "Scene not found",
  "code": "annotation.scene.not_found",
  "status": 404,
  "requestId": "...",
  "timestamp": "2026-04-25T10:30:00.000Z",
  "path": "/api/projects/p1/annotations/for-scene/s1",
  "method": "GET"
}
```

Simpler local-controller errors:

```json
{ "error": "expectedVersion is required" }
```

```json
{ "error": "Failed to update geometry", "message": "..." }
```

Recommended normalizer:

```ts
type AnnotationFrontendError = {
  status: number
  code?: string
  error: string
  details?: unknown
  requestId?: string
}

function normalizeAnnotationError(payload: any, fallbackStatus: number): AnnotationFrontendError {
  return {
    status: typeof payload?.status === 'number' ? payload.status : fallbackStatus,
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    error: typeof payload?.error === 'string' ? payload.error : 'Unknown annotation error',
    details: payload?.details ?? payload?.message,
    requestId: typeof payload?.requestId === 'string' ? payload.requestId : undefined,
  }
}
```

Suggested UI behaviour by status:

- `400`: invalid payload or immutable-field attempt
- `401`: redirect to login / refresh session
- `403`: show permission error
- `404`: entity or scene no longer exists; refresh state
- `409`: OCC conflict or invalid restore order; refresh and retry explicitly
- `500`: generic backend problem; show request id if present

## Practical Frontend Patterns

### Prefer Bundle Reload After Cascade Operations

After these operations, a full scene-bundle reload is usually simpler and safer:

- geometry erasable
- geometry non-erasable
- data erasable
- data non-erasable
- link restore

### Keep Scope Fields Immutable in UI

Do not expose in-place editing for:

- `geometry.referenceType`
- `geometry.referenceId`
- `data.visibilityType`
- `data.visibilityId`

If the user needs to move an annotation to another scope, implement it as create-new plus relink, not as an in-place move.

### Store Versions Per Entity Type

Track versions independently for:

- geometry
- data
- link

Do not assume one global annotation version.
