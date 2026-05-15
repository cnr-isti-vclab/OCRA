# Annotation API

## Introduction

This document describes the annotation APIs and service semantics for the adopted annotation model in OCRA.

It is organized in three layers:

- Repository layer: direct MongoDB access for annotation collections
- Service layer: validation, scope checks, OCC, scene-aware reads, and primitive lifecycle transitions
- REST API: authenticated endpoints exposed by the backend

The current implementation lives mainly in:

- `backend/src/repositories/annotation-geometry.repository.ts`
- `backend/src/repositories/annotation-data.repository.ts`
- `backend/src/repositories/annotation-link.repository.ts`
- `backend/src/services/annotation.service.ts`
- `backend/src/controllers/annotation.controller.ts`
- `backend/src/routes/annotation.routes.ts`

## General Guarantees

### Project Scoping

All annotation entities are scoped by `projectId`.

### Optimistic Concurrency Control

Mutable annotation documents use a numeric `version` field as the OCC token.

- `annotationGeometry`: OCC on shape updates and erasable/non-erasable transitions
- `annotationData`: OCC on mutable field updates and erasable/non-erasable transitions
- `annotationLink`: OCC on erasable/non-erasable transitions

The repository conditional update pattern is a MongoDB `findOneAndUpdate` with filter:

```ts
{ id, version: expectedVersion }
```

If the filter no longer matches, the operation returns a version conflict result.

### Atomicity Model

The adopted model uses two levels of atomicity:

- Single-document atomic writes for ordinary insert/update operations and primitive lifecycle transitions
- Optional higher-level transactions for later composite multi-entity operations when explicitly introduced

Primitive lifecycle operations do not cascade automatically between collections.

## Repository Layer

The repositories operate on three MongoDB collections in `ocra_content`:

- `annotation_geometry`
- `annotation_data`
- `annotation_link`

Shared repository helpers are defined in `backend/src/repositories/annotation.repository.common.ts`.

### Shared Helpers

#### `getAnnotationCollection(collectionName)`

Returns a typed MongoDB collection from `ocra_content`.

#### `ensureAnnotationIndexes(collectionName, collection, indexes)`

Creates indexes lazily on first access for each collection.

#### `createProjectScopedIdIndex()`

Creates the unique index `{ projectId: 1, id: 1 }`.

#### `createOccConflictResult(expectedVersion)`

Builds the repository-level OCC conflict result.

#### `createOccSuccessResult(expectedVersion, document)`

Builds the repository-level OCC success result with `nextVersion`.

### Geometry Repository

Implemented in `backend/src/repositories/annotation-geometry.repository.ts`.

Implemented functions:

- `getAnnotationGeometryCollection()`
- `findAnnotationGeometryById(id)`
- `findAnnotationGeometriesByProjectId(projectId)`
- `findAnnotationGeometriesByReference(projectId, referenceType, referenceId)`
- `findAnnotationGeometriesByReferenceIds(projectId, referenceType, referenceIds)`
- `insertAnnotationGeometry(doc)`
- `conditionalUpdateAnnotationGeometry(id, expectedVersion, update)`

Indexes ensured lazily:

- unique `{ projectId: 1, id: 1 }`
- `{ projectId: 1, referenceType: 1, referenceId: 1 }`
- `{ projectId: 1, erasableAt: 1 }`

Atomicity notes:

- `insertAnnotationGeometry` is a single-document atomic insert
- `conditionalUpdateAnnotationGeometry` is a single-document atomic OCC update

### Data Repository

Implemented in `backend/src/repositories/annotation-data.repository.ts`.

Implemented functions:

- `getAnnotationDataCollection()`
- `findAnnotationDataById(id)`
- `findAnnotationDataByProjectId(projectId)`
- `findAnnotationDataByVisibility(projectId, visibilityType, visibilityId)`
- `findAnnotationDataByVisibilityIds(projectId, visibilityType, visibilityIds)`
- `insertAnnotationData(doc)`
- `conditionalUpdateAnnotationData(id, expectedVersion, update)`

Indexes ensured lazily:

- unique `{ projectId: 1, id: 1 }`
- `{ projectId: 1, visibilityType: 1, visibilityId: 1 }`
- `{ projectId: 1, erasableAt: 1 }`

Atomicity notes:

- `insertAnnotationData` is a single-document atomic insert
- `conditionalUpdateAnnotationData` is a single-document atomic OCC update

### Link Repository

Implemented in `backend/src/repositories/annotation-link.repository.ts`.

Implemented functions:

- `getAnnotationLinkCollection()`
- `findAnnotationLinkById(id)`
- `findAnnotationLinksByProjectId(projectId)`
- `findAnnotationLinksByGeometryId(projectId, geometryId)`
- `findAnnotationLinksByDataId(projectId, dataId)`
- `findAnnotationLinksByGeometryIds(projectId, geometryIds)`
- `findAnnotationLinksByDataIds(projectId, dataIds)`
- `findAnnotationLinkByPair(projectId, geometryId, dataId)`
- `insertAnnotationLink(doc)`
- `conditionalUpdateAnnotationLink(id, expectedVersion, update)`
- `deleteAnnotationLinkById(projectId, id)`
- `deleteAnnotationLinksByProjectId(projectId)`
- `deleteErasableAnnotationLinksByProjectId(projectId)`

Indexes ensured lazily:

- unique `{ projectId: 1, id: 1 }`
- unique `{ projectId: 1, geometryId: 1, dataId: 1 }`
- `{ projectId: 1, geometryId: 1 }`
- `{ projectId: 1, dataId: 1 }`
- `{ projectId: 1, erasableAt: 1 }`

Atomicity notes:

- `insertAnnotationLink` is a single-document atomic insert
- `conditionalUpdateAnnotationLink` is a single-document atomic OCC update
- delete helpers are single-statement MongoDB deletes

## Service Layer

Implemented in `backend/src/services/annotation.service.ts`.

### Scene-Aware Read Services

#### `getAnnotationGeometry(projectId, geometryId, includeErasable = false)`

Returns one geometry if visible in the requested visibility mode. With `includeErasable = false`, an erasable geometry may still be returned if at least one non-erasable link keeps it alive.

#### `getAnnotationData(projectId, dataId, includeErasable = false)`

Returns one data record if visible in the requested visibility mode. With `includeErasable = false`, an erasable data record may still be returned if at least one non-erasable link keeps it alive.

#### `getAnnotationLink(projectId, linkId, includeErasable = false)`

Returns one link if it belongs to the project and passes the erasable filter.

#### `getAnnotationGeometries(projectId, sceneId?, includeErasable = false)`

Returns project geometries when `sceneId` is omitted, or geometries visible in the scene bundle when it is provided. With `includeErasable = false`, weak geometries may still be present when a strong link keeps them alive. Error results when `sceneId` is provided:

- `invalid_input`
- `scene_not_found`

#### `getAnnotationDataList(projectId, sceneId?, includeErasable = false)`

Returns project data records when `sceneId` is omitted, or data visible in the scene bundle when it is provided. With `includeErasable = false`, weak data records may still be present when a strong link keeps them alive. Error results when `sceneId` is provided:

- `invalid_input`
- `scene_not_found`

#### `getAnnotationLinksForProject(projectId, includeErasable = false, filters?)`

Returns project links, optionally filtered by `geometryId` or `dataId`.

#### `getAnnotationLinksForSceneAssets(projectId, sceneId, includeErasable = false)`

Returns links visible in the scene bundle. Error results:

- `invalid_input`
- `scene_not_found`

#### `getAnnotationsForScene(projectId, sceneId, includeErasable = false)`

Returns:

```ts
{ geometries, data, links }
```

Error results:

- `invalid_input`
- `scene_not_found`

#### `getResolvedAnnotationsForScene(projectId, sceneId, includeErasable = false)`

Builds resolved triples `{ geometry, data, link }`. This is implemented in the service layer but is not currently exposed via REST.

### Geometry Mutation Services

#### `createAnnotationGeometry(projectId, shapes, referenceType, referenceId, userId)`

Returns `geometryId` or one of:

- `invalid_input`
- `reference_not_found`
- `invalid_geometry_document`
- `duplicate_geometry`

Atomicity: single-document insert.

#### `updateAnnotationGeometryShapes(projectId, geometryId, expectedVersion, newShapes, userId)`

Returns next version or:

- `invalid_input`
- `geometry_not_found`
- `version_conflict`
- `invalid_geometry_document`

Atomicity: single-document OCC update.

#### `markAnnotationGeometryErasable(projectId, geometryId, expectedVersion, userId)`

Marks only the geometry erasable. It does **not** alter connected links.

#### `markAnnotationGeometryNonErasable(projectId, geometryId, expectedVersion, userId)`

Marks only the geometry non-erasable. It does **not** alter connected links.

### Data Mutation Services

#### `createAnnotationData(projectId, label, description, annotationClass, content, visibilityType, visibilityId, userId)`

Returns `dataId` or:

- `invalid_input`
- `reference_not_found`
- `invalid_data_document`
- `duplicate_data`

Atomicity: single-document insert.

#### `updateAnnotationData(projectId, dataId, expectedVersion, updates, userId)`

Updates only `label`, `description`, `class`, `content`. Scope fields are immutable.

Returns next version or:

- `invalid_input`
- `data_not_found`
- `no_mutable_fields`
- `version_conflict`
- `invalid_data_document`

Atomicity: single-document OCC update.

#### `markAnnotationDataErasable(projectId, dataId, expectedVersion, userId)`

Marks only the data record erasable. It does **not** alter connected links.

#### `markAnnotationDataNonErasable(projectId, dataId, expectedVersion, userId)`

Marks only the data record non-erasable. It does **not** alter connected links.

### Link Mutation Services

#### `createAnnotationLink(projectId, geometryId, dataId, userId)`

Returns `linkId` or:

- `invalid_input`
- `project_context_not_available`
- `geometry_not_found`
- `data_not_found`
- `duplicate_link_pair`
- `scope_incompatible`
- `invalid_link_document`

Atomicity: single-document insert.

#### `markAnnotationLinkErasable(projectId, linkId, expectedVersion, userId)`

Marks only the link erasable. It does **not** alter geometry or data state.

Atomicity: single-document OCC update.

#### `markAnnotationLinkNonErasable(projectId, linkId, expectedVersion, userId)`

Marks only the link non-erasable.

Preconditions:

1. the link exists
2. the link is currently erasable

In the adopted model, a non-erasable link is allowed to reference endpoints that are themselves still erasable. That simply means the link is strong while one or both endpoints remain weak.

Returns the next link version.

Atomicity: single-document OCC update at the primitive level. Composite restore workflows may still exist later as higher-level APIs.

## REST API

Implemented in `backend/src/routes/annotation.routes.ts` and `backend/src/controllers/annotation.controller.ts`.

Permissions:

- Read routes: viewer, editor, manager
- Mutation routes: editor, manager

### Real-Time Event Routes

- `GET /api/projects/{projectId}/annotations/events`
- `POST /api/projects/{projectId}/annotations/events/social-lock/start`
- `POST /api/projects/{projectId}/annotations/events/social-lock/stop`

These routes implement the informational annotation Broadcast Network real-time layer.

Important design note:

- this layer does not enforce consistency
- OCC remains the authoritative correctness mechanism for writes
- if the stream disconnects or notifications are missed, ordinary annotation reads and writes still behave correctly

#### `GET /api/projects/{projectId}/annotations/events`

Opens a Server-Sent Events stream (`text/event-stream`) for annotation notifications.

Supported query params:

- `sceneId` optional frontend context hint

Transport headers set by the backend:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

The backend also sends:

- `retry: 5000`
- lightweight keep-alive comments to reduce accidental connection drops through intermediaries

Event families currently emitted:

- `annotation.connected`
- `annotation.social_lock.started`
- `annotation.social_lock.stopped`
- `annotation.mutated`

The initial handshake event is `annotation.connected`, which returns a backend-generated `streamId` and any already active social locks visible in the chosen scope.

Delivery note:

- when `sceneId` is omitted, the SSE transport is project-wide
- when `sceneId` is provided, backend delivery is filtered to events whose `impact` affects that scene
- frontend consumers should still treat `impact` as the authoritative routing metadata for refresh/highlight logic

Implemented payload types are defined in `shared/annotation-events.ts`.

#### `POST /api/projects/{projectId}/annotations/events/social-lock/start`

Broadcasts an informational social-lock start notification to SSE subscribers.

Required request fields:

- `streamId`
- `originScopeType` (`scene` or `asset`)
- `originScopeId`

Optional request fields:

- `lockKind` one of `presence`, `editor`
- `resourceType` one of `geometry`, `data`, `link`
- `resourceId`
- `activity`

Validation notes:

- `resourceType` and `resourceId` must be paired when targeting one entity
- if `lockKind = editor`, `resourceType/resourceId` are required
- if `lockKind = presence`, `resourceType/resourceId` must be omitted
- if `lockKind` is omitted, backend infers `editor` when `resourceType/resourceId` are present, otherwise `presence`
- the referenced `streamId` must belong to the authenticated session
- the referenced origin scene or asset must exist in the project HDT
- legacy `sceneId` is still accepted and is interpreted as `originScopeType: "scene"`

Possible responses:

- `202` social-lock accepted and broadcast
- `400` invalid payload
- `404` referenced stream or origin scope not found

#### `POST /api/projects/{projectId}/annotations/events/social-lock/stop`

Clears a previously announced informational social lock (presence or editor).

Required request fields:

- `streamId`
- `originScopeType` (`scene` or `asset`)
- `originScopeId`

Optional request fields:

- `lockKind` one of `presence`, `editor`
- `resourceType` one of `geometry`, `data`, `link`
- `resourceId`
- `activity`

Possible responses:

- `202` social-lock removal accepted and broadcast
- `400` invalid payload
- `404` referenced stream or origin scope not found
- `409` social lock not found

### Real-Time Event Payloads

#### `annotation.connected`

Typical payload:

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

#### `annotation.social_lock.started` / `annotation.social_lock.stopped`

Typical payload:

```json
{
	"type": "annotation.social_lock.started",
	"timestamp": "2026-04-25T12:01:00.000Z",
	"lockKind": "editor",
	"streamId": "9b63d0b8-a5b9-4a70-94d4-bd9c984e4a15",
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
	"resourceType": "geometry",
	"resourceId": "ag_123",
	"activity": "editing",
	"startedAt": "2026-04-25T12:01:00.000Z"
}
```

Social-lock kinds:

- `presence`: announces that a user is active in a scope (`scene` or `asset`) without targeting one specific annotation resource
- `editor`: announces active editing intent on one specific resource (`resourceType/resourceId`), while still carrying `impact` for multi-scene asset propagation

When the origin is asset-scoped, `sceneId` may be `null` and `impact` becomes the authoritative routing metadata. For mixed link mutations the backend uses `impact.originScopeType = "mixed"` and `impact.originScopeId = null`.

#### `annotation.mutated`

This event is emitted after successful committed annotation mutations.

Implemented mutation kinds:

- `geometry.created`
- `geometry.updated`
- `geometry.erasable`
- `geometry.restored`
- `data.created`
- `data.updated`
- `data.erasable`
- `data.restored`
- `link.created`
- `link.erasable`
- `link.restored`

Typical payload:

```json
{
	"type": "annotation.mutated",
	"timestamp": "2026-04-25T12:02:00.000Z",
	"projectId": "p1",
	"sceneId": "scene-main",
	"impact": {
		"originScopeType": "asset",
		"originScopeId": "asset-7",
		"affectedSceneIds": ["scene-main", "scene-alt"],
		"affectedAssetIds": ["asset-7"]
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

Consumers should use `impact` rather than `sceneId` to determine whether the current scene or asset view is affected.

### Scene Bundle Routes

- `GET /api/projects/{projectId}/annotations?sceneId={sceneId}`
- `GET /api/projects/{projectId}/annotations/geometry?sceneId={sceneId}`
- `GET /api/projects/{projectId}/annotations/data?sceneId={sceneId}`
- `GET /api/projects/{projectId}/annotations/links?sceneId={sceneId}`

The bundle route and the three list routes accept an optional `sceneId` query parameter so they can return either all project annotations or only annotations visible in a specific scene. The links route also accepts optional `geometryId` and `dataId` filters, and when `sceneId` is present those filters are applied after scene visibility. These routes accept `includeErasable=true|false` and are read-only.

### Geometry Routes

- `GET /api/projects/{projectId}/annotations/geometry/{geometryId}`
- `POST /api/projects/{projectId}/annotations/geometry`
- `PUT /api/projects/{projectId}/annotations/geometry/{geometryId}`
- `PATCH /api/projects/{projectId}/annotations/geometry/{geometryId}/erasable`
- `PATCH /api/projects/{projectId}/annotations/geometry/{geometryId}/nonerasable`

### Data Routes

- `GET /api/projects/{projectId}/annotations/data/{dataId}`
- `POST /api/projects/{projectId}/annotations/data`
- `PUT /api/projects/{projectId}/annotations/data/{dataId}`
- `PATCH /api/projects/{projectId}/annotations/data/{dataId}/erasable`
- `PATCH /api/projects/{projectId}/annotations/data/{dataId}/nonerasable`

### Link Routes

- `GET /api/projects/{projectId}/annotations/links`
- `GET /api/projects/{projectId}/annotations/links/{linkId}`
- `POST /api/projects/{projectId}/annotations/links`
- `PATCH /api/projects/{projectId}/annotations/links/{linkId}/erasable`
- `PATCH /api/projects/{projectId}/annotations/links/{linkId}/nonerasable`

`GET /annotations/links` supports optional query params:

- `geometryId`
- `dataId`
- `includeErasable`

## Error Semantics

The annotation controllers map many service failures to HTTP responses using stable error codes, for example:

- `annotation.scene.not_found`
- `annotation.geometry.version_conflict`
- `annotation.data.not_found`
- `annotation.link.scope_incompatible`

Current annotation endpoints still expose two error shapes:

- structured API error envelopes returned via `sendApiError(...)`
- simpler controller-local responses such as `{ "error": "expectedVersion is required" }`

Frontend clients should support both.

## Not Implemented Here

The following items were documented in earlier versions of this file but are not currently implemented in the annotation stack and are therefore intentionally excluded:

- `validateLink` / `validateAllLinks`
- `deleteOrphanedGeometries` / `deleteOrphanedData`
- `exportAnnotationsForScene` / `importAnnotations`
- `getAnnotationGeometriesForAsset`
- `getAnnotationDataForAsset`
- `getAnnotationLinksForScene`
- `getAnnotationLinksForAsset`
- session/structuring APIs such as `startReading`, `stopReading`, `startStructuring`

The old conceptual names `notifyEditingStart` and `notifyEditingStop` are now implemented as REST endpoints under:

- `POST /api/projects/{projectId}/annotations/events/social-lock/start`
- `POST /api/projects/{projectId}/annotations/events/social-lock/stop`
