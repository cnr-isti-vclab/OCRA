# Annotation API

## Introduction

This document describes the annotation APIs that are actually implemented in OCRA today.

It is organized in three layers:

- Repository layer: direct MongoDB access for annotation collections
- Service layer: validation, scope checks, OCC, scene-aware reads, and cascade orchestration
- REST API: authenticated endpoints exposed by the backend

The current implementation lives mainly in:

- `backend/src/repositories/annotation-geometry.repository.ts`
- `backend/src/repositories/annotation-data.repository.ts`
- `backend/src/repositories/annotation-link.repository.ts`
- `backend/src/services/annotation.service.ts`
- `backend/src/controllers/annotation.controller.ts`
- `backend/src/routes/annotation.routes.ts`

This document intentionally excludes APIs that are only planned or were documented earlier but are not implemented anymore.

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

The current implementation uses two levels of atomicity:

- Single-document atomic writes for ordinary insert/update operations
- Multi-document MongoDB transactions for cascade-sensitive state transitions

Implemented transaction-based operations:

- `markAnnotationGeometryErasable(...)`
- `markAnnotationGeometryNonErasable(...)`
- `markAnnotationDataErasable(...)`
- `markAnnotationDataNonErasable(...)`
- `markAnnotationLinkNonErasable(...)`

Important detail: `markAnnotationLinkNonErasable(...)` runs in a transaction, but it does **not** restore geometry or data. It restores only the link after verifying that both endpoints still exist and are already non-erasable.

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

Returns one geometry if visible in the requested visibility mode.

#### `getAnnotationData(projectId, dataId, includeErasable = false)`

Returns one data record if visible in the requested visibility mode.

#### `getAnnotationLink(projectId, linkId, includeErasable = false)`

Returns one link if it belongs to the project and passes the erasable filter.

#### `getAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable = false)`

Returns geometries visible in the scene bundle. Error results:

- `invalid_input`
- `scene_not_found`

#### `getAnnotationDataForSceneAssets(projectId, sceneId, includeErasable = false)`

Returns data records visible in the scene bundle. Error results:

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

Transactionally:

1. marks the geometry erasable
2. marks all currently non-erasable links connected to that geometry as erasable

This is the implemented geometry-to-link cascade.

#### `markAnnotationGeometryNonErasable(projectId, geometryId, expectedVersion, userId)`

Transactionally:

1. restores the geometry to non-erasable
2. restores only those connected links whose data endpoint is already non-erasable

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

Transactionally:

1. marks the data record erasable
2. marks all currently non-erasable links connected to that data record as erasable

#### `markAnnotationDataNonErasable(projectId, dataId, expectedVersion, userId)`

Transactionally:

1. restores the data record to non-erasable
2. restores only those connected links whose geometry endpoint is already non-erasable

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

Restores only the link, not the endpoints.

Preconditions enforced inside one transaction:

1. the link exists
2. the link is currently erasable
3. geometry exists
4. data exists
5. geometry is already non-erasable
6. data is already non-erasable

Returns:

```ts
{ linkVersion, geometryVersion, dataVersion }
```

Atomicity: MongoDB transaction. The transaction is used to check endpoint state and update the link consistently, even though only the link document is modified.

## REST API

Implemented in `backend/src/routes/annotation.routes.ts` and `backend/src/controllers/annotation.controller.ts`.

Permissions:

- Read routes: viewer, editor, manager
- Mutation routes: editor, manager

### Scene Bundle Routes

- `GET /api/projects/{projectId}/annotations/for-scene/{sceneId}`
- `GET /api/projects/{projectId}/annotations/geometry/for-scene/{sceneId}`
- `GET /api/projects/{projectId}/annotations/data/for-scene/{sceneId}`
- `GET /api/projects/{projectId}/annotations/links/for-scene/{sceneId}`

These routes accept `includeErasable=true|false` and are read-only.

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
- session/social-lock/structuring APIs such as `startReading`, `stopReading`, `notifyEditingStart`, `notifyEditingStop`, `startStructuring`
