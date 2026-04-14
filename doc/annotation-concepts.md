# Annotations in 3D Models

## Introduction

This document defines the core concepts of the annotation system. It introduces a decomposed, relational data model in which spatial anchors, semantic content, and their associations are represented as independent entities.

The model separates three concepts:

**Spatial placement** — `annotationGeometry`
The 3D shape that anchors an annotation in space. An `annotationGeometry` is expressed in the reference frame of a specific scene or asset, meaning its coordinates and spatial properties are defined relative to that scene’s or asset’s coordinate system.
It represents only spatial information and may exist independently of any semantic content or links.

**Semantic content** — `annotationData`
The information conveyed by an annotation. An `annotationData` defines the semantic payload of the annotation and its visibility scope. It can be defined either for a single scene, meaning it is visible only within that scene, or for a specific asset, meaning it is visible in every scene in which that asset appears.
It represents only semantic information and may exist independently of any spatial placement or links.

**Association** — `annotationLink`
The explicit association between a spatial anchor (`annotationGeometry`) and a semantic content record (`annotationData`). The relation expressed by `annotationLink` is many-to-many: a single `annotationGeometry` may be associated with multiple `annotationData` records, and a single `annotationData` may be associated with multiple `annotationGeometry` records.

In this model, annotationGeometry and annotationData are independent resources whose relationships are defined exclusively through annotationLink.

<FIXME>
In order to simplify the collaborative model, `annotationGeometry.referenceType`, `annotationGeometry.referenceId`, `annotationData.visibilityType`, and `annotationData.visibilityId` must be considered immutable after creation.

At the annotation-service level, the relevant concept is `erasable`, not true deletion. An `annotationGeometry` or `annotationData` starts in the `non-erasable` state. Marking it as `erasable` does not delete it: it only means that the entity may disappear from the visible annotation model once it is no longer referenced by any `annotationLink`.

While at least one `annotationLink` points to an entity, both `erasable` and `non-erasable` entities remain visible. When the last incoming link is removed, an `erasable` entity disappears from normal queries and lists, while a `non-erasable` entity remains visible as a standalone annotation resource.

Editor-side, `erasable` entities may still be displayed with a distinct visual style. Physical removal from MongoDB remains a lower-level concern and does not define the high-level semantics.
</FIXME>


## Basic Concepts
⚠️ These concepts could be moved to `data-model.md`.

- An asset has its own unique ID, its own reference system, and a digital representation that must specify its type (2D, 3D) and provide methods for drawing itself (and selecting areas, etc.).
- A scene has its own unique ID, its own reference system, and refers to a set of assets, positioned in this reference system. 
- An asset can be shared between multiple scenes.
---
- An annotation geometry is a geometric region, expressed either in the reference of a scene or in the reference of an asset.
- An annotation data is a semantic description, which is either relative to an asset or a scene. If relative to an asset, it is visible in all scenes containing it; if relative to a scene, it is visible only in that scene.
- An annotation link is a relationship between annotation geometry and annotation data.
<FIXME>
- The scope of an annotation geometry or annotation data should not be changed in place. Moving an annotation to another scene or asset should be modeled as creating new entities and updating links accordingly.
</FIXME>
---
- The operations allowed by Ocra are scene structuring, viewing, and editing.
- Structure consists of creating/destroying scenes, adding/removing assets from scenes, positioning assets, etc.
- Viewing consists of exploring assets and their annotations.
- Editing consists of adding/removing/modifying annotation geometry, annotation data, and annotation links.
<FIXME>
- At this abstraction level, removal of `annotationGeometry` and `annotationData` should be modeled through the `erasable` / `non-erasable` state plus link reachability, rather than through immediate true delete operations.
</FIXME>
---
- Concurrency Rule 1: When a structuring operation is in progress, everything else is blocked until the end. No other structuring/editing/viewing operations are permitted.
- Concurrency Rule 2: One can always view every scene when a structuring operation is not in progress, regardless of other editing/viewing operations. A local copy is loaded and displayed.
- Concurrency Rule 3 (Optimistic Concurrency): Multiple users can access and edit scene annotations concurrently. However, concurrent edits are resolved optimistically: an editing operation is committed only if the underlying data has not been modified by another user in the meantime. 
<FIXME>
- Concurrency Rule 4: `update` and changes to the `erasable` / `non-erasable` state should all use the same `expectedUpdatedAt` optimistic check. No operation type has automatic priority over the others.
- Concurrency Rule 5: the strategy is optimistic, so conflicts should be resolved only by comparing the local copy with the current DB state at save time. In particular, both `updatedAt` and the persisted `erasable` state (for example `erasableAt`) are part of the state that must be validated before applying an `update` or changing erasability.
- Concurrency Rule 6: the social messaging layer may be used to communicate collaborative events, but it must not be essential for correctness. The model must still work correctly even if those messages are delayed or absent.
</FIXME>
- The above concurrency rules rely on a stateless architecture for annotations. Rather than structural database locks for annotations, conflicts are resolved at commit time and "Social Locks" (temporary visual indicators) are used to warn editors of parallel activities.



## Workflows
⚠️ These concepts could be moved to `workflow.md`

The following workflows explain how user can interact with the framework.
They perform the main operations without a fine-grained concurrency management.

For project-level structuring operations, the workflows may still rely on coarse-grained exclusion. For annotation editing, however, the model is optimistic: multiple users may edit the same contents concurrently, and conflicts are resolved only when comparing the local copy with the current DB state at save time.


Implementation note: 
- OCRA mantains the list of active sessions. 
- For project-level structuring operations, OCRA verifies whether a session can be started according to the coarse-grained concurrency rules.
- For annotation editing, active sessions mainly provide presence information and do not prevent concurrent edits.
- When a user starts a session, it is added to the list of active sessions. 
- When a user ends a session, it is removed from the list of active sessions. 
- ⚠️ TODO think about session management for `Admin` user

### Workflow 1, scene structuring: project level data (HDTs, scenes, assets) creation, modification and deletion
- Project level data can be edited only by `Admin` or `Creator` or `Project Manager`.
- Concurrency Rule 1: during the creation or modification of an HDT, scene or asset properties, no other user can access the data neither to read nor to write.
- ⚠️ TODO detail workflow

### Workflow 2, annotation editing: annotations creation, modification and deletion
- `Editor` or user with higher privileges can create, modify or delete annotations in a scene.
- Concurrency Rule 1: editing is not permitted when structuring operations are in progress.
- Concurrency Rule 3 (Optimistic Concurrency): Users can edit scene or asset annotations concurrently.
  - When starting to edit an annotation, a lightweight "Social Lock" can be broadcasted via `notifyEditingStart` to warn other users with a visual cue.
  - Upon saving an update or changing the erasability state, the system performs a conditional write using `expectedUpdatedAt` in the database filter. The value of `expectedUpdatedAt` is the `updatedAt` timestamp read when editing began. If the stored record no longer matches that timestamp, the write is not applied and the operation fails, preventing stale data from overwriting newer changes. If the write succeeds, the client replaces its local `expectedUpdatedAt` value with the new `updatedAt` returned by the database.
  - At implementation level, each collection entry may also carry a per-document `version` field used for optimistic concurrency. Create and update operations write that field atomically, while timestamps remain server-assigned so all clients observe a coherent time source.
<FIXME>
- Proposed wording: annotation editing should be described as creation, modification, marking an entity as `erasable`, and restoring it to `non-erasable`.
- When attempting to save, the client should first compare the local copy with the current DB state. If the target entity has become `erasable` in the meantime, the UI may ask whether to stop or continue on the current state. Continuing means issuing a new intentional operation against the current version, not blindly replaying the stale one.
- Implementation note: with an OCC approach, MongoDB can perform these checks atomically by expressing the expected version and persisted erasability state in the update filter, so validation and write happen as an atomic operation.
- In update-vs-erasable conflicts, neither operation should automatically win if it is based on a stale `expectedUpdatedAt`: the stale operation should fail and the user should decide the next step.
- Social or presence messages may help communicate events early, but they are optional and must not be required for the model to function.
</FIXME>
- ⚠️ TODO detail workflow

### Workflow 3, scene viewing
- All users can view a scene.
- Concurrency Rule 1: viewing is not permitted when structuring operations are in progress.
- Concurrency Rule 2: One can always view every scene when a structuring operation is not in progress, regardless of other editing/viewing operations. A local copy is loaded and displayed.
  - Multiple users can view the same scene at the same time
  - If the annotations of a scene are edited by a user, other user can still view the scene. 
  - When a user loads the scene, it will load the version of the scene  with the last saved modifications. 
  - After a scene is loaded for viewing, the changes made by other users will not be visible until the scene is reloaded.   
- ⚠️ TODO detail workflow

## Overview

### Entity summary

| Entity | Role |
| --- | --- |
| `annotationGeometry` | Standalone 3D geometric shapes relative to a scene or an asset |
| `annotationData` | Standalone semantic content relative to a scene or an asset |
| `annotationLink` | Immutable join entity associating one geometry node with one data record |

<FIXME>
`annotationGeometry` and `annotationData` may be in either `non-erasable` or `erasable` state. At high level, an entity is visible if it still has at least one incoming `annotationLink`, or if it is still `non-erasable`. An `erasable` entity disappears from normal reads only after the last incoming link is removed.
</FIXME>

The entities are stored in the corresponding collections.

Implementation note: for each MongoDB collection, concurrency can rely on a per-document `version` field updated atomically by create and update operations, while `createdAt` and `updatedAt` timestamps should be assigned server-side to guarantee consistency.

![Diagram illustrating the data model and relationships](media/annotation-model.svg)


<a id="annotationlink-scene-consistency-table"></a>AnnotationLink scene consistency table, considering the relative position of the geometry and data to a scene or an asset
| Geometry<br>referenceType | Data<br>visibilityType | Consistency | Visibility |
| --- | --- | --- | --- |
| `"scene"` | `"scene"` | `geometry.referenceId` == `data.visibilityId` | single scene |
| `"scene"` | `"asset"` | `geometry scene contains data asset` | single scene<br>single asset |
| `"asset"` | `"scene"` | `geometry asset is contained in data scene` | single scene<br>single asset |
| `"asset"` | `"asset"` | `geometry.referenceId` == `data.visibilityId` | multiple scenes<br>single asset |


The `annotationLink` permits to express annotations as a many-to-many relationship between geometry element and data element. 
A single geometry element can be associated with multiple annotation data records; a single annotation data record can be applied to multiple geometry elements. A single `annotationLink` entity expresses a one-to-one association between a geometry element and a data element.
When an annotation is edited the operation has impact on a limited set of scenes: the specified scene or the scenes that contain the specified asset. 

All the collection entries have a `projectId` field (as index), that identifies the project they belong to. This allows querying the collections for a specific project.
Without the project id, it would be impossible to distinguish between annotations of different projects. 

### API levels
The collections are accessed through a two-level API. 
The Low-Level DB Operations allow to modify the single entities, while the High-Level API provides a higher-level interface to manage annotations as a whole, keeping the integrity of the associations.

<FIXME>
At this level of abstraction, the API should model annotation state and visibility semantics (`non-erasable` / `erasable`, plus link reachability) rather than the physical CRUD lifecycle of MongoDB documents. Physical deletion and garbage collection belong to a lower layer.
</FIXME>

---

## Data Model

### `annotationGeometry`

`annotationGeometry` is an independent entity that defines the 3D geometric shapes of an annotation anchor and its binding to a scene or asset. It is composed of one or more shapes of possibly different types. It has information expressing its reference frame, that can be a scene or an asset. It is the spatial anchor of an annotation.

#### Shape types (examples)

A Shape defines a 3D geometric primitive. 
Each shape contain a type that is used to identify the shape in the 3d scene. 
Each shape contain shape specific data. 
Currently supported shape types:

- `"ShapePoints"`: a set of 3D sample points. It contains `vertices`: an array of `[x, y, z]` coordinate triplets (one or more).
- `"ShapePolyline"`: a sequence of connected line segments. It contains `vertices`: an array of `[x, y, z]` coordinate triplets (two or more).
- `"ShapePolygon"`: a closed planar area. It contains `vertices`: an array of `[x, y, z]` coordinate triplets in order (three or more). Closure is implicit at application level

All coordinates are expressed relative to the annotationGeometry 3D reference space.

#### annotationGeometry fields

- `id: string`  
  Unique identifier of the geometry element within the project.

- `projectId: string`  
  Identifier of the project this geometry belongs to.

- `shapes: array of Shapes`: array of 3D shapes, geometric primitives that together define an annotation anchor. Each element is an object defining a 3D shape. A single `annotationGeometry` may contain one or more shapes of any combination of types. The simple case is a single-element `shapes` array. Heterogeneous groups (e.g. a ShapePoint and a ShapePolyline) are expressed by including multiple shapes in the array.

- `referenceType: "scene" | "asset"`  
  Indicates whether this geometry is anchored to a scene or to a digital asset, defining the reference space for its coordinates and its visibility scope.

- `referenceId: string`  
  Identifier of the target `HDTScene` or `DigitalAsset`, depending on `referenceType`. This field determines the 3D reference space in which shapes coordinates are expressed, and controls scene visibility.

- `version: integer`  
  Monotonic document version used for optimistic concurrency on this `annotationGeometry`. It is written as part of the create operation and incremented as part of each successful update in the same atomic write.

<FIXME>
- `erasableAt: ISO 8601 timestamp | null`
- `erasableBy: user id | null`
</FIXME>

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`


#### Invariants

- `projectId` must be a valid, existing project identifier.
- `referenceType` must be `"scene"` or `"asset"`.
- `referenceId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` at the time of creation.
- <FIXME>`referenceType` and `referenceId` are immutable after creation.</FIXME>
- `shapes` must be a non-empty array of valid shapes.

#### JSON example

```json
{
    "id": "geom_abc123",
    "projectId": "proj_xyz987",
    "shapes": [
        {
            "type": "ShapePolygon",
            "vertices": [
                [0.42, 0.31, 0.12],
                [0.44, 0.31, 0.12],
                [0.44, 0.33, 0.12],
                [0.42, 0.33, 0.12]
            ]
        },
        {
            "type": "ShapePoints",
            "vertices": [
                [0.43, 0.32, 0.12],
                [0.435, 0.315, 0.12]
            ]
        },
        {
            "type": "ShapePolyline",
            "vertices": [
                [0.41, 0.30, 0.12],
                [0.45, 0.35, 0.12],
                [0.46, 0.36, 0.12]
            ]
        }
    ],
    "referenceType": "scene",
    "referenceId": "scene_id_main",
    "version": 0,
    "createdAt": "2026-03-11T10:00:00.000Z",
    "createdBy": "user-id-1",
    "updatedAt": "2026-03-11T10:00:00.000Z",
    "updatedBy": "user-id-1"
}
```

---

### `annotationData`

`annotationData` is an independent entity that holds the semantic content of an annotation. It exists independently of any specific geometry and can be linked to one or more geometry elements via `annotationLink`.

#### Fields

- `id: string`  
  Unique identifier of the annotation data element.

- `projectId: string`  
  Identifier of the project this data belongs to.

- `label: string`  
  Short label or title of the annotation. Must be concise and suitable for lists, legends, and quick-selection tools.

- `description: string`  
  Free-text description. May contain a detailed explanation, notes, or references.

- `class: string | null`  
  Optional classification label, for example `damage`, `restoration`, `material`, `diagnostic`. A controlled vocabulary for valid class values may be enforced at application level.

- `content: Object` The annotation content payload, with arbitrary structure and semantics defined an onthology. To be better defined.

- `visibilityType: "scene" | "asset"`  
  Indicates whether this data record is visible in a scene or asset context. This field controls the visibility scope of the annotation data and must be consistent with the reference type of any geometry it is linked to.
  
- `visibilityId: string`  
  Identifier of the target `HDTScene` or `DigitalAsset`, depending on `visibilityType`. This field determines the id of the scene or asset context in which this annotation data is visible, and must be consistent with the reference id of any geometry it is linked to.

- `version: integer`  
  Monotonic document version used for optimistic concurrency on this `annotationData`. It is written as part of the create operation and incremented as part of each successful update in the same atomic write.

<FIXME>
- `erasableAt: ISO 8601 timestamp | null`
- `erasableBy: user id | null`
</FIXME>

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`

#### Invariants
- `projectId` must be a valid, existing project identifier.
- `label` must be a non-empty string.
- `visibilityType` and `visibilityId` are immutable after creation.

#### JSON example

```json
{
    "id": "data_def456",
    "projectId": "proj_xyz987",
    "label": "Lacuna",
    "description": "Small loss of material on the lower left area.",
    "class": "damage",
    "content": {},
    "visibilityType": "scene",
    "visibilityId": "scene_id_xyz",
    "version": 0,
    "createdAt": "2026-03-11T10:00:00.000Z",
    "createdBy": "user-id-1",
    "updatedAt": "2026-03-11T10:00:00.000Z",
    "updatedBy": "user-id-1"
}
```

---

### `annotationLink`

`annotationLink` is a first-class join entity that represents the association between one `annotationGeometry` element and one `annotationData` element.

It carries no semantic content of its own. Its role is to make the geometry–data association explicit, auditable, and independently manageable.

`annotationLink` is **immutable after creation**: no update operation is defined. To modify an association, the existing link must be deleted and a new one created.

For the same reason, `annotationLink` does not need its own `version` field at this level: there is no update path to protect with optimistic concurrency, only create and delete.

<FIXME>
`annotationLink` removal at this abstraction level should remain a true delete. `annotationLink` represents only the current existence of a relation; it does not need its own `erasable` lifecycle.
</FIXME>


#### Fields

- `id: string`  
  Unique identifier of the link.

- `projectId: string`  
  Identifier of the project this link belongs to.

- `annotationGeometry: string`  
  Identifier of the `annotationGeometry` element referenced by this association.

- `annotationData: string`  
  Identifier of the `annotationData` element associated through this link.

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  

#### Invariants
1. `projectId` must be a valid, existing project identifier.

2. **Referential integrity**  
   Both `annotationGeometry` and `annotationData` must reference existing entities at the time of creation and must remain valid throughout the link's lifetime.

3. **Uniqueness**  
  The pair (`annotationGeometry`, `annotationData`) must be unique within the system. A geometry element may not be linked to the same annotation data record more than once.

4. **Scene consistency**  
   Only certain combinations of `annotationGeometry.referenceType`, `annotationGeometry.referenceId`, `annotationData.visibilityType` and `annotationData.visibilityId` are allowed. 
   References must be consistent with the scene structure as shown in <a href="#annotationlink-scene-consistency-table">annotationLink scene consistency table</a>. 
   


#### JSON example

```json
{
    "id": "link_ghi789",
    "projectId": "proj_xyz987",
    "annotationGeometry": "geom_abc123",
    "annotationData": "data_def456",
    "createdAt": "2026-03-11T10:00:00.000Z",
    "createdBy": "user-id-1"
}
```
---

## Queries

### Start/stop reading/editing

<FIXME>
Editor-oriented read operations may need an optional `includeErasable` behavior, so that `erasable` entities can still be displayed and styled differently even when they would otherwise disappear from normal lists.
</FIXME>

#### `startReading(projectId, sceneId): boolean`

Call this function to see if the scene can be read (there are no locks on the scene).

Returns `true` if the user is allowed to read the scene, `false` otherwise.

A scene can be locked for reading if there are Project level edit operations (e.g. HDT publish) in progress.

#### `stopReading(projectId, sceneId): void`

Called after reading is finished.

#### `notifyEditingStart(projectId, sceneId, targetId?): void`

Call this function to inform the system that the user has begun an editing session on a specific scene, asset, or annotation (`targetId`).

This does NOT enforce a database lock. Instead, it maintains a lightweight presence layer (a "Social Lock") used by the frontend to display warnings to other active users (e.g., showing a padlock icon to indicate potential parallel editing).

This notification might have a Time-To-Live (TTL) so it expires automatically if the user disconnects.

#### `notifyEditingStop(projectId, sceneId, targetId?): void`

Called after editing is finished or aborted. It drops the "Social Lock" and informs other viewers that the local editing session has ended. 

---

### Read operations on annotationGeometry

#### `getAnnotationGeometry(projectId, geometryId): annotationGeometry`

Returns a single `annotationGeometry` element identified by `geometryId`

---

#### `getAnnotationGeometriesForAsset(projectId, assetId): annotationGeometry[]`

Returns all `annotationGeometry` elements referencing a given asset.

A geometry element references an asset if `referenceType == "asset"` and `referenceId == assetId`.

---

#### `getAnnotationGeometriesForScene(projectId, sceneId) : annotationGeometry[]`

Returns all `annotationGeometry` elements referencing a given scene.

A geometry element references a scene if `referenceType == "scene"` and `referenceId == sceneId`.

---

#### `getAnnotationGeometriesForSceneAssets(projectId, sceneId, sceneAssetIds[]) : annotationGeometry[]`

Returns all `annotationGeometry` elements belonging to a given scene.

A geometry element belongs to a scene if it references the scene or one of the assets in the scene.

---

### Read operations on annotationData

#### `getAnnotationData(projectId, dataId): annotationData`

Returns a single `annotationData` element identified by `dataId`

---

#### `getAnnotationDataForAsset(projectId, assetId): annotationData[]`

Returns all `annotationData` elements visible for a given asset.

A data element is visible for an asset if `visibilityType == "asset"` and `visibilityId == assetId`.

---

#### `getAnnotationDataForScene(projectId, sceneId, sceneAssetIds[]) : annotationData[]`

Returns all `annotationData` elements visible within a given scene.

A data element is visible within a scene if `visibilityType == "scene"` and `visibilityId == sceneId`.

---

#### `getAnnotationDataForSceneAssets(projectId, sceneId, sceneAssetIds[]) : annotationData[]`

Returns all `annotationData` elements belonging to a given scene.

A data element belongs to a scene if it is visible for the scene or one of the assets in the scene.

---

### Read operations on annotationLink

#### `getAnnotationLink(projectId, linkId): annotationLink`

Returns a single `annotationLink` identified by `linkId`

**Post conditions:**
1. The returned annotationLink belongs to the project

---

#### `getAnnotationLinksForProject(projectId): annotationLink[]`

Returns all `annotationLink` records associated with a given project. This is a full scan of the project-level annotation stores.

**Post conditions:**
1. All returned annotationLinks belong to the project

---

#### `getAnnotationLinksForGeometry(projectId, geometryId): annotationLink[]`

Returns all `annotationLink` records that reference a given `annotationGeometry`. 

**Post conditions:**
1. All returned annotationLinks belong to the project
2. All returned annotationLinks reference the annotationGeometry element

---

#### `getAnnotationLinksForData(projectId, dataId): annotationLink[]`

Returns all `annotationLink` records that reference a given `annotationData`. 

**Post conditions:**
1. All returned annotationLinks belong to the project
2. All returned annotationLinks reference the annotationData element
---

#### `getAnnotationLinksForAsset(projectId, assetId): annotationLink[]`

Returns all `annotationLink` records that reference a given `assetId`. 

**System actions:**
1. Get all annotationGeometry elements that reference the asset.
2. Get all annotationData elements that reference the asset.
3. Get all annotationLink elements that reference the collected geometry or data.

**Post conditions:**
1. All returned annotationLinks belong to the project
2. All returned annotationLinks reference either an annotationGeometry or an annotationData element that references the asset.
---

#### `getAnnotationLinksForScene(projectId, sceneId): annotationLink[]`

Returns all `annotationLink` records that reference a given `sceneId`. 

**System actions:**
1. Get all annotationGeometry elements that reference the scene.
2. Get all annotationData elements that reference the scene.
3. Get all annotationLink elements that reference the collected geometry or data.

**Post conditions:**
1. All returned annotationLinks belong to the project
2. All returned annotationLinks reference either an annotationGeometry or an annotationData element that references the scene.
---

#### `getAnnotationLinksForSceneAssets(projectId, sceneId, sceneAssetIds[]): annotationLink[]`

Returns all `annotationLink` records that reference a given `sceneId` or one of the assets in the scene. 

**System actions:**
1. Get all annotationGeometry elements that reference the scene or one of the assets in the scene.
2. For each annotationGeometry element, get all annotationLink elements that reference it.
3. Keep only the annotationLink that reference an annotationData element that is visible in the scene or in one of the assets in the scene.

**Post conditions:**
The returned link may reference only one of these combinations:
- geometry references the scene, data visible in the scene
- geometry references the scene, data visible in one of the sceneAssetIds
- geometry references one of the sceneAssetIds, data visible in the scene
- geometry references one of the sceneAssetIds, data visible in the same asset

---

## Low-level DB Operations

Low-level operations interact with a single DB and keep it consistent with itself. They do not interact with other DBs, possibly breaking the system consistency.

While high-level operations interact with other DBs and keep the system consistent.

Operations outside of the Annotation management service (on projects, scenes, assets, etc.) are not considered here, but must be performed in order to keep the system consistent (e.g. when an asset is deleted, all annotationGeometry elements with referenceType == "asset" and referenceId == deletedAsset.id must be deleted).


### `annotationGeometry` operations

#### `createAnnotationGeometry(projectId, shapes, referenceType, referenceId) : string`

Creates a new `annotationGeometry` element. Return the annotationGeometry id

**Pre-conditions:**
- `projectId` must reference an existing project.
- `referenceType` must be `"scene"` or `"asset"`.
- `referenceId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` respectively.
- `shapes` must be a non-empty array of valid Shape elements

**Post-conditions:**
- `projectId` is contained into the project DB
- `id` is contained into the annotationGeometry DB
- `id` is globally unique and immutable.

**System actions:**
1. Generate a new unique `id`.
2. Persist the element to the geometry store in a single create operation that initializes `version` and sets `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`.

**Returns:**
- `id` if the element was created.
- `null` if the element already exists.

---

#### `updateAnnotationGeometryShapes(projectId, geometryId, expectedUpdatedAt, newShapes) : string | false`
Updates the `shapes` field of an existing `annotationGeometry` element.

`expectedUpdatedAt`: the timestamp of the geometry when the user began editing. If this does not match the current DB timestamp, the update is rejected (Optimistic Concurrency Check).
`shapes`: the update operation replace the old shape array with the new one. 

**Invariants:**
- `projectId` must be a valid, existing project identifier.
- `geometryId` is globally unique and immutable.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- `newShapes` must be a non-empty array.

**Post-conditions:**
- `shapes` are updated


**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, update `shapes`, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was updated successfully.
- `false` if the element does not exist or if validation failed.

<FIXME>
---

#### `markAnnotationGeometryErasable(projectId, geometryId, expectedUpdatedAt) : string | false`

Marks an `annotationGeometry` as `erasable` without physically deleting it.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.

**Post-conditions:**
- `erasableAt` and `erasableBy` are set.

**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, set `erasableAt` and `erasableBy`, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was marked as erasable successfully.
- `false` if the element does not exist or validation failed.

---

#### `markAnnotationGeometryNonErasable(projectId, geometryId, expectedUpdatedAt) : string | false`

Restores an `annotationGeometry` to the `non-erasable` state.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- `annotationGeometry.erasableAt` must not be `null`.

**Post-conditions:**
- `erasableAt` and `erasableBy` are reset to `null`.

**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, set `erasableAt = null` and `erasableBy = null`, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was restored to non-erasable successfully.
- `false` if the element does not exist or validation failed.
</FIXME>

---

#### `deleteAnnotationGeometry(projectId, geometryId, expectedUpdatedAt) : boolean`

Deletes an `annotationGeometry` element from the store. It keeps the annotationGeometry DB valid, but it does not ensure the system consistency. This is a private low-level operation intended for internal cleanup and garbage collection, not a regular annotation-service API operation.

This is a low-level operation. Before invoking it directly, all `annotationLink` records referencing this geometry must have been resolved. 
In practice, this operation is separate from `annotationLink` deletion, because `deleteAnnotationLink` removes only the relation and does not perform deep deletion of the referenced entities.

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- No `annotationLink` must reference this `geometryId` at the time of deletion.

**Post-conditions:**
- `id` is not contained into the annotationGeometry DB.

**System actions:**
1. Verify `expectedUpdatedAt` against the database. If mismatch, reject.
2. Remove the element from the geometry store.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist or validation failed.

---

### `annotationData` operations

#### `createAnnotationData(projectId, label, description, class, visibilityType, visibilityId) : string`

Creates a new `annotationData` element. Return the annotationData id

**Invariants:**
- `projectId` must reference an existing project.
- `label` must be a non-empty string.

**Pre-conditions:**
- If `visibilityType` is "scene", `visibilityId` must be a valid existing `sceneId`.
- If `visibilityType` is "asset", `visibilityId` must be a valid existing `assetId`.

**Post-conditions:**
- `id` is contained into the annotationData DB.

**System actions:**
1. Generate a new unique `id`.
2. Persist the element to the data store in a single create operation that initializes `version` and sets `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`.

**Returns:**
- `id` if the element was created.
- `null` if the element already exists.

---

#### `updateAnnotationData(projectId, dataId, expectedUpdatedAt, label, description, class, content) : string | false` 

Updates one or more mutable fields of an `annotationData` element.

`expectedUpdatedAt`: the timestamp of the data when the user began editing. If this does not match the current DB timestamp, the update is rejected (Optimistic Concurrency Check).

**Permitted fields:** `label`, `description`, `class`, `content` changing these fields does not affect the system consistency.

**Invariants:**
- `projectId` must reference an existing project.
- `dataId` must reference an existing `annotationData`.

**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, apply the patch to the permitted fields, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was updated successfully.
- `false` if the element does not exist or validation failed.

---

#### (No visibility update operation)

`annotationData.visibilityType` and `annotationData.visibilityId` are immutable after creation.

If an annotation data record must move to a different scope, the system must create a new `annotationData`, update the links accordingly, and eventually mark the old record as `erasable` if appropriate.

<FIXME>
---

#### `markAnnotationDataErasable(projectId, dataId, expectedUpdatedAt) : string | false`

Marks an `annotationData` element as `erasable` without physically deleting it.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.

**Post-conditions:**
- `erasableAt` and `erasableBy` are set.

**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, set `erasableAt` and `erasableBy`, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was marked as erasable successfully.
- `false` if the element does not exist or validation failed.

---

#### `markAnnotationDataNonErasable(projectId, dataId, expectedUpdatedAt) : string | false`

Restores an `annotationData` element to the `non-erasable` state.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.
- `annotationData.erasableAt` must not be `null`.

**Post-conditions:**
- `erasableAt` and `erasableBy` are reset to `null`.

**System actions:**
1. Perform a conditional update using `expectedUpdatedAt` in the database filter. If no document matches, reject.
2. In the same atomic write, set `erasableAt = null` and `erasableBy = null`, increment `version`, and set `updatedAt` and `updatedBy`.

**Returns:**
- The new `updatedAt` string if the element was restored to non-erasable successfully.
- `false` if the element does not exist or validation failed.
</FIXME>

---

#### `deleteAnnotationData(projectId, dataId, expectedUpdatedAt) : boolean` 

Deletes an `annotationData` element from the store. It keeps the annotationData DB consistent, but it does not ensure the system consistency. This is a private low-level operation intended for internal cleanup and garbage collection, not a regular annotation-service API operation.

As with `deleteAnnotationGeometry`, this is a low-level operation. All `annotationLink` records referencing this data element must have been resolved before invocation.

**Invariants:**
- `projectId` must be a valid, existing project identifier.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.

**Post-conditions:**
- `dataId` is not contained into the annotationData DB.

**System actions:**
1. Verify `expectedUpdatedAt` against the database. If mismatch, reject.
2. Remove the element from the data store.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist or validation failed.

---

### `annotationLink` operations

#### `createAnnotationLink(projectId, annotationGeometryId, annotationDataId): string`

Creates a new `annotationLink` associating one `annotationGeometry` element with one `annotationData` record. Return the annotationLink id or null if it already exists.

**Invariants:**
1. `projectId` must reference an existing project.
2. `annotationGeometryId` must reference an existing `annotationGeometry` belonging to the same project.
3. `annotationDataId` must reference an existing `annotationData` belonging to the same project.

**Pre-conditions (all must hold):**
1. The pair (`annotationGeometryId`, `annotationDataId`) must not already exist as a link.
2. **Scene consistency**: 
- must satisfy the same scene consistency constraints defined in the [annotationLink scene consistency table](#annotationlink-scene-consistency-table).

**Post-conditions:**
- `linkId` is contained into the annotationLink DB.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`.
3. Persist the link to the link store.

**Returns:**
- `linkId` if the element was created.
- `null` if the element already exists.

---

#### (No update operation)

`annotationLink` is immutable after creation. No fields may be modified.

To change an association, delete the existing link and create a new one.

---
#### `deleteAnnotationLink(projectId, linkId) : boolean`

Deletes the `annotationLink` only. It keeps the annotationLink DB consistent, but it does not ensure the system consistency: dangling references may remain.  

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `linkId` must reference an existing `annotationLink`.

**System actions:**
1. Remove the element from the link store.

**Post-conditions:**
- `linkId` is not contained into the annotationLink DB.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

## High-level operations

### Delete operations

<FIXME>
At the annotation-service level, high-level delete operations should not be modeled as deep-delete APIs.

Proposed rule:
- `annotationGeometry` and `annotationData` start as `non-erasable`.
- they may later be marked as `erasable`, without being physically deleted.
- they remain visible while at least one `annotationLink` still points to them.
- once the last incoming link is removed, an `erasable` entity disappears from the visible annotation model, while a `non-erasable` entity remains available.
- true delete operations operate only on a single collection at a time (`annotationGeometry`, `annotationData`, or `annotationLink`).
- any higher-level workflow may orchestrate multiple single-collection operations, but the API should not expose `delete...Deep` operations that mix link removal, orphan detection, and physical deletion in one call.

`annotationLink` removal should stay as a true delete.
</FIXME>


## Maintenance operations

#### `removeAnnotationsWithProject(projectId) : boolean`

Removes all annotation records associated with a given project from the annotation collections.

**Pre-conditions:**
- `projectId` must reference an existing project.

**Post-conditions:**
- All `annotationLink` records associated with the project are removed.
- All `annotationGeometry` records associated with the project are removed.
- All `annotationData` records associated with the project are removed.

**System actions:**

1. Remove all `annotationLink` records with the given `projectId`.
2. Remove all `annotationGeometry` records with the given `projectId`.
3. Remove all `annotationData` records with the given `projectId`.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `removeAnnotationsWithScene(projectId, sceneId) : boolean`

Removes all annotation records associated with a given scene from the annotation collections.

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `sceneId` must reference an existing scene.

**Post-conditions:**
- Matching `annotationLink` records are removed.
- Matching `annotationGeometry` records associated with the scene are removed.
- Matching `annotationData` records associated with the scene are removed.

**System actions:**

1. Remove all `annotationLink` records associated with the scene.
2. Remove all `annotationGeometry` records associated with the scene.
3. Remove all `annotationData` records associated with the scene.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `removeAnnotationsWithAsset(projectId, assetId) : boolean`

Removes all annotation records associated with a given asset from the annotation collections.

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `assetId` must reference an existing asset.

**Post-conditions:**
- Matching `annotationLink` records are removed.
- Matching `annotationGeometry` records associated with the asset are removed.
- Matching `annotationData` records associated with the asset are removed.

**System actions:**

1. Remove all `annotationLink` records associated with the asset.
2. Remove all `annotationGeometry` records associated with the asset.
3. Remove all `annotationData` records associated with the asset.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `validateLink(linkId)`

Verifies all invariants for a given `annotationLink`:

1. Referential integrity of `annotationGeometry` and `annotationData`.
2. Uniqueness of the (`annotationGeometry`, `annotationData`) pair.
3. Scene consistency constraint on annotationData and annotationGeometry, see [annotationLink scene consistency table](#annotationlink-scene-consistency-table).

Returns a validation report listing any violated constraints.

---

#### `validateAllLinks()`

Runs `validateLink` on every `annotationLink` record in the system. Returns a list of invalid links with their violation details. Intended for data integrity audits and post-migration verification.

---

#### `deleteOrphanedGeometries()`

Deletes all `annotationGeometry` elements not referenced by any `annotationLink`. 

---

#### `deleteOrphanedData()`

Deletes all `annotationData` elements not referenced by any `annotationLink`. 

---

#### `onSceneDeletion(sceneId)`

Handles all cascading cleanup when a scene is deleted.

**Sequence:**
1. Invoke `removeAnnotationsWithScene(sceneId)`.
2. Delegate any physical deletion of orphaned documents to lower-level cleanup logic.


---

#### `onAssetDeletion(assetId)`

Handles all cascading cleanup when a digital asset is deleted.

**Sequence:**

1. Invoke `removeAnnotationsWithAsset(assetId)`.
2. Delegate any physical deletion of orphaned documents to lower-level cleanup logic.

---

### Import and export operations

#### `exportAnnotationsForScene(sceneId, format?)`

Exports all annotations visible in a given scene as a structured document (e.g. JSON or CSV). Includes resolved geometry, data, and link records. Useful for reporting, archiving, or interoperability with external tools.

---

#### `importAnnotations(payload, sceneId?)`

Imports a structured set of annotation records (geometry, data, links) into the system, validating all invariants before persisting. Optionally scopes the import to a specific scene. Returns a summary of imported, skipped, and rejected records.

---

## Typical Access Patterns

- Retrieving all annotations visible in a given scene
- Retrieving all annotations associated with a given digital asset
- Retrieving a single annotation by `annotationLink` identifier
- Filtering annotations by class within a scene
- Searching annotations by label or free-text description
- Finding all data records associated with a given geometry element
- Finding all geometry elements associated with a given data record
- Identifying orphaned geometries and data after bulk deletions
- Validating referential integrity and invariants after import or migration
- Exporting all annotations for a scene for external reporting

---
