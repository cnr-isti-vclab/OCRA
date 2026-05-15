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

In bare mode the frontend should now be reached on `http://localhost:3001`, matching non-bare mode.

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
GET /api/projects/{projectId}/annotations?sceneId={sceneId}
```

Optional query parameter:

- `sceneId={sceneId}`
- `includeErasable=true`

When `sceneId` is omitted, the same endpoint returns the full annotation bundle for the project.

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

If the UI needs only one entity family, the same query pattern is available on the dedicated list routes:

- `GET /api/projects/{projectId}/annotations/geometry?sceneId={sceneId}`
- `GET /api/projects/{projectId}/annotations/data?sceneId={sceneId}`
- `GET /api/projects/{projectId}/annotations/links?sceneId={sceneId}`

The links route also accepts `geometryId` and `dataId`; if `sceneId` is present, those id filters are applied after scene visibility is resolved.

## Real-Time Connection via SSE

The annotation backend now exposes one SSE stream, called the annotation Broadcast Network, for two kinds of informational events:

- social-lock notifications
- committed annotation mutation notifications

This connection is informational only. It does not replace OCC and it does not change save semantics.

### Broadcast Network SSE Endpoint

Open the stream with:

```http
GET /api/projects/{projectId}/annotations/events?sceneId={sceneId}
```

Notes:

- the endpoint is authenticated exactly like the other annotation endpoints
- the transport is project-wide; `sceneId` is optional and acts only as frontend view context
- the response is `text/event-stream`
- the backend serves it with `Cache-Control: no-cache, no-transform`
- the backend also sends `retry: 5000`, so browser `EventSource` clients automatically retry after disconnects

### Event Types

The stream currently emits three event families:

- `annotation.connected`
- `annotation.social_lock.started` and `annotation.social_lock.stopped`
- `annotation.mutated`

For social-lock and mutation events, the backend now includes an `impact` object so the frontend can decide whether the current scene is affected, whether the origin is scene-scoped or asset-scoped, and whether the change should be surfaced with stronger UI feedback.

The shared frontend/backend contract is defined in `shared/annotation-events.ts`.

### Connection Handshake

When the stream opens, the backend sends an initial `annotation.connected` event.

Typical payload shape:

```json
{
  "type": "annotation.connected",
  "timestamp": "2026-04-25T12:00:00.000Z",
  "streamId": "9b63d0b8-a5b9-4a70-94d4-bd9c984e4a15",
  "projectId": "p1",
  "sceneId": "scene-main",
  "activeSocialLocks": []
}
```

Frontend implication:

- store `streamId`
- use it later when sending `notifyEditingStart` / `notifyEditingStop`
- initialize local social-lock indicators from `activeSocialLocks`
- treat `sceneId` in the handshake as the connection context, not as a server-side delivery filter

### Recommended Frontend Connection Pattern

The current frontend implementation uses a small dedicated service:

- `frontend/src/services/AnnotationEventsService.ts`

Its responsibilities are:

- open one `EventSource` per active project/scene annotation view
- track connection state: `idle`, `connecting`, `connected`, `reconnecting`, `error`
- remember the backend-assigned `streamId`
- expose helper methods for social-lock start/stop notifications
- trigger a controlled scene reload after remote committed mutations or after reconnect

Minimal usage example:

```ts
const events = new AnnotationEventsService(projectId, sceneId)

events.connect({
  onConnectionStateChange: state => {
    console.log('annotation realtime state', state)
  },
  onMutation: event => {
    console.log('remote committed mutation', event)
    reloadScene()
  },
  onReconnect: () => {
    reloadScene()
  },
})

return () => events.disconnect()
```

Recommended behaviour:

1. open the SSE connection when the annotation view for a scene becomes active
2. keep one connection per open scene view, not one per annotation
3. on `annotation.mutated`, use `impact.affectedSceneIds` / `impact.affectedAssetIds` to decide whether the current view is affected, then refresh the affected entity or reload the current scene bundle
4. on reconnect, perform a safe refresh because some events may have been missed while offline

### Keep-Alive and Reconnect Semantics

The backend sends lightweight SSE keep-alive comments to reduce the chance of the HTTP stream being closed by intermediaries.

Important distinction:

- the keep-alive helps preserve the connection
- the automatic reconnect is handled by the browser `EventSource`, using the `retry` value sent by the server

So the frontend should treat reconnect as normal and should refresh the scene or the affected entities after reconnect.

## Social Lock Usage

The social lock is implemented as a separate write API paired with the SSE stream.

It is best-effort and informational only. If the notification fails or is never sent, the annotation system must still continue to function correctly through OCC.

### Social-Lock Start

```http
POST /api/projects/{projectId}/annotations/events/social-lock/start
```

Request body:

```json
{
  "streamId": "9b63d0b8-a5b9-4a70-94d4-bd9c984e4a15",
  "originScopeType": "scene",
  "originScopeId": "scene-main",
  "resourceType": "geometry",
  "resourceId": "ag_123",
  "activity": "editing"
}
```

### Social-Lock Stop

```http
POST /api/projects/{projectId}/annotations/events/social-lock/stop
```

Request body:

```json
{
  "streamId": "9b63d0b8-a5b9-4a70-94d4-bd9c984e4a15",
  "originScopeType": "scene",
  "originScopeId": "scene-main",
  "resourceType": "geometry",
  "resourceId": "ag_123",
  "activity": "editing"
}
```

Current contract notes:

- `streamId`, `originScopeType`, and `originScopeId` are required
- `resourceType` and `resourceId` should be sent together when the lock targets one entity
- valid `resourceType` values are `geometry`, `data`, `link`
- `activity` is optional descriptive metadata
- `originScopeType` is `scene` or `asset`
- `originScopeId` names the source scene or asset being edited
- legacy `sceneId` is still accepted as shorthand for `originScopeType: "scene"`
- the corresponding SSE event carries `impact.originScopeType`, `impact.originScopeId`, `impact.affectedSceneIds`, and `impact.affectedAssetIds`

Typical `impact` shapes:

- scene-origin edit: `originScopeType: "scene"`, one affected scene, no affected assets
- asset-origin edit: `originScopeType: "asset"`, one affected asset, all scenes containing that asset
- compatible mixed link edit: `originScopeType: "mixed"`, `originScopeId: null`, union of affected scenes/assets from the linked geometry and data

### Recommended Social-Lock Workflow

Use social lock around editing intent, not around viewing.

Recommended flow:

1. open the SSE connection and wait for `annotation.connected`
2. when the user starts editing one concrete entity, call `notifyEditingStart(...)`
3. while the user edits, show incoming social-lock state from other sessions in the UI
4. when the user saves, cancels, closes the editor, or leaves the scene, call `notifyEditingStop(...)`
5. if the tab disconnects abruptly, rely on stream closure cleanup on the backend rather than trying to guarantee one last stop message

Minimal usage example:

```ts
await events.notifyEditingStart({
  resourceType: 'geometry',
  resourceId: geometryId,
  activity: 'editing',
})

try {
  await saveGeometryChanges()
} finally {
  await events.notifyEditingStop({
    resourceType: 'geometry',
    resourceId: geometryId,
    activity: 'editing',
  })
}
```

### How to React to Social-Lock Events

When the frontend receives `annotation.social_lock.started`:

- show a lightweight cue for the target entity if `resourceType` and `resourceId` are present
- otherwise show a scene-level editing-presence indication
- never block editing or saving because of this event

When the frontend receives `annotation.social_lock.stopped`:

- remove the corresponding visual indicator

When the frontend first receives `annotation.connected`:

- reconcile the UI with `activeSocialLocks` in case other sessions were already editing before this client connected

## Mutation Notifications

The backend now emits `annotation.mutated` after successful committed operations on:

- geometry create/update/erasable/restore
- data create/update/erasable/restore
- link create/erasable/restore

Typical payload shape:

```json
{
  "type": "annotation.mutated",
  "timestamp": "2026-04-25T12:01:00.000Z",
  "projectId": "p1",
  "sceneId": "scene-main",
  "impact": {
    "originScopeType": "scene",
    "originScopeId": "scene-main",
    "affectedSceneIds": ["scene-main"],
    "affectedAssetIds": []
  },
  "sessionId": "session-123",
  "userId": "u1",
  "username": "annotator",
  "mutation": "geometry.updated",
  "entity": {
    "kind": "geometry",
    "id": "ag_123",
    "version": 4,
    "referenceType": "scene",
    "referenceId": "scene-main",
    "erasable": false
  }
}
```

Recommended frontend behaviour:

- if `impact` shows that the current scene or asset view is affected and the entity is not currently being edited locally, reload that entity or reload the scene bundle
- if the entity is currently being edited locally, show a non-blocking remote-change warning
- after reconnect, reload the scene because one or more mutation events may have been missed

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

- marking a geometry erasable changes only that geometry
- marking a data record erasable changes only that data record

Frontend implication: if the UI wants to express a broader intent such as "delete this annotation" or "make this cluster weak", it should call higher-level composite operations when available, or orchestrate the primitive transitions explicitly.

### Restore Geometry or Data to Non-Erasable

Implemented backend behaviour:

- restoring geometry changes only that geometry
- restoring data changes only that data record

### Restore Link to Non-Erasable

Important implementation detail:

- restoring a link changes only the link itself
- a non-erasable link is allowed to point to geometry or data that are still erasable

This means the frontend is responsible for guiding the user through stronger semantic operations. For example, the UI may still recommend restoring geometry and data before restoring the link, but that is a product decision rather than a low-level API invariant.

### Weak/Strong Interpretation in the UI

The persisted field names stay `erasable` and `non-erasable`, but the frontend should interpret them semantically as:

- `non-erasable` = strong / not collectible
- `erasable` = weak / collectible if not kept alive

Recommended consequences for the frontend:

- a strong link should be understood as keeping its endpoints alive for maintenance purposes
- because of that rule, ordinary reads may still include weak geometry or data when a strong link keeps them alive
- weak entities may still be shown in dedicated recovery or trash views
- a weak entity referenced by a strong link may still be rendered or selectable if the UX chooses to expose it that way
- higher-level actions such as "delete annotation", "restore annotation", or "recover from trash" should be presented as explicit guided flows rather than inferred automatically from primitive state transitions

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
  "path": "/api/projects/p1/annotations?sceneId=s1",
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
- `409`: OCC conflict or invalid state transition; refresh and retry explicitly
- `500`: generic backend problem; show request id if present

## Practical Frontend Patterns

### Prefer Bundle Reload After Composite Operations

After higher-level operations that intentionally coordinate several primitive transitions, a full scene-bundle reload is usually simpler and safer than patching individual entities in place.

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

## End-to-End Examples

This section shows one complete frontend flow using the currently implemented SSE connection and social-lock APIs.

### End-to-End Geometry Edit Flow

Scenario:

- the user opens the annotation UI for one scene
- the frontend opens the SSE stream
- the user starts editing one geometry
- the frontend announces the social lock
- the frontend saves the geometry with OCC
- the frontend clears the social lock

Example:

```ts
import { AnnotationEventsService } from '../src/services/AnnotationEventsService'

async function editGeometryExample(
  projectId: string,
  sceneId: string,
  geometryId: string,
  expectedVersion: number,
  shapes: unknown[],
) {
  const events = new AnnotationEventsService(projectId, sceneId)

  const streamReady = new Promise<void>((resolve) => {
    events.connect({
      onConnectionStateChange: (state) => {
        console.log('annotation realtime state:', state)
        if (state === 'connected') {
          resolve()
        }
      },
      onMutation: async (event) => {
        console.log('remote mutation received:', event)
        await reloadSceneBundle(projectId, sceneId)
      },
      onReconnect: async () => {
        console.log('annotation stream reconnected, refreshing scene bundle')
        await reloadSceneBundle(projectId, sceneId)
      },
    })
  })

  await streamReady

  await events.notifyEditingStart({
    resourceType: 'geometry',
    resourceId: geometryId,
    activity: 'editing',
  })

  try {
    const response = await fetch(
      `/api/projects/${projectId}/annotations/geometry/${geometryId}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          shapes,
        }),
      },
    )

    if (response.status === 409) {
      await reloadSceneBundle(projectId, sceneId)
      throw new Error('OCC conflict while saving geometry')
    }

    if (!response.ok) {
      throw new Error('Failed to save geometry')
    }

    const payload = await response.json()
    console.log('geometry saved with next version:', payload.version)
  } finally {
    await events.notifyEditingStop({
      resourceType: 'geometry',
      resourceId: geometryId,
      activity: 'editing',
    })

    events.disconnect()
  }
}
```

What happens on the backend during this flow:

1. the SSE stream is opened with `GET /api/projects/{projectId}/annotations/events?sceneId={sceneId}`
2. the backend returns `annotation.connected` with one `streamId`
3. `notifyEditingStart(...)` calls `POST /api/projects/{projectId}/annotations/events/social-lock/start`
4. other connected clients receive `annotation.social_lock.started`
5. the geometry update is saved through the normal REST mutation route with OCC
6. after a successful commit, connected clients receive `annotation.mutated`
7. `notifyEditingStop(...)` calls `POST /api/projects/{projectId}/annotations/events/social-lock/stop`
8. other connected clients receive `annotation.social_lock.stopped`

### Minimal EventSource Example Without the Service Wrapper

If the frontend team prefers to integrate incrementally, this is the smallest direct browser example:

```ts
const url = new URL(`/api/projects/${projectId}/annotations/events`, window.location.origin)
url.searchParams.set('sceneId', sceneId)

const source = new EventSource(url.toString(), { withCredentials: true })

let streamId: string | null = null

source.addEventListener('annotation.connected', (event) => {
  const payload = JSON.parse(event.data)
  streamId = payload.streamId
  console.log('active social locks on connect:', payload.activeSocialLocks)
})

source.addEventListener('annotation.social_lock.started', (event) => {
  const payload = JSON.parse(event.data)
  console.log('show social-lock cue for', payload.resourceType, payload.resourceId)
})

source.addEventListener('annotation.social_lock.stopped', (event) => {
  const payload = JSON.parse(event.data)
  console.log('remove social-lock cue for', payload.resourceType, payload.resourceId)
})

source.addEventListener('annotation.mutated', async (event) => {
  const payload = JSON.parse(event.data)
  console.log('remote committed change:', payload.mutation)
  await reloadSceneBundle(projectId, sceneId)
})

source.onerror = () => {
  console.log('annotation stream interrupted; EventSource will retry automatically')
}

async function notifyEditingStart(resourceType: 'geometry' | 'data' | 'link', resourceId: string) {
  if (!streamId) return

  await fetch(`/api/projects/${projectId}/annotations/events/social-lock/start`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sceneId,
      streamId,
      resourceType,
      resourceId,
      activity: 'editing',
    }),
  })
}

async function notifyEditingStop(resourceType: 'geometry' | 'data' | 'link', resourceId: string) {
  if (!streamId) return

  await fetch(`/api/projects/${projectId}/annotations/events/social-lock/stop`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sceneId,
      streamId,
      resourceType,
      resourceId,
      activity: 'editing',
    }),
  })
}
```

### Recommended UI Behaviour in the End-to-End Flow

- Connect once when entering the scene annotation view.
- Wait for `annotation.connected` before attempting `notifyEditingStart`.
- Send social-lock start only when the user actually begins editing a concrete entity.
- Always clear the lock in `finally`, even if the save fails.
- Treat `annotation.mutated` as informational: refresh the scene or entity, but do not bypass OCC.
- After reconnect, refresh the scene because some events may have been missed while the connection was down.
