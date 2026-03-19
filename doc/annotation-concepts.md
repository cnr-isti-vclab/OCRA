# Annotations in 3D Models

## Workflows

Before deepening into Annotations, we propose the following workflows showing how user can interact with the framework (these concepts will be moved to a separate dedicated document).
Workflows will highlight how to handle user concurrency, showing how the framework manages concurrent access to the same data, considering the type of user and the type of data.

The basic idea is to simply avoid to have multiple users editing the same data at the same time. 
When user edits contents the user locks the data and no other user can modify it.
There are two types of data: project level data (HDTs, scenes, assets) and annotation data.
Project level data can be edited only by root users. Annotation data can be edited by users with `edit` or `root` access to a scene.

### Workflow 1: Root user creates, modifies or deletes project level data
- During the creation or modification of an HDT, a scene, or an asset by user with root privileges, no other user can access the data neither to read nor to write.
- On editing a project level data, the data is locked for reading and writing for all users. 

### Workflow 2: User creates, modifies or deletes annotations
- Users with `edit` or  `root` access to a scene can create, modify or delete annotations in that scene.
- When a scene is edited by a user, no other user can access the same scene for editing.
- When an asset is edited by a user, no other user can access the same asset for editing.
- To permit a higher concurrency level, we propose to add a static `editable` flag associated to scene asset entries. We thus can have multiple scenes, containing the same assets.
- These scenes can be edited concurrently by multiple users, but only on the editable asset entries.
- If multiple scenes have the same asset marked as editable, the first scene that is opened in `edit` mode will have the exclusive right to edit the scene and the editable asset entries. 
- If a scene is edited by a user, no other user can access the same scene for editing.

### Workflow 3: User views scenes
- Users with `view` or  `edit` or  `root` access to a scene can view the scene.
- Multiple viewers can view the same scene at the same time
- If a scene is edited by a user, other user can still view the scene. When a viewer loads the scene, it will load the version of the scene  with the last saved modifications. During the editing session, the other viewers will not see the modifications.  
- When a user saves the modifications, the new version of the scene will be visible to the viewers only after they reload the scene. 
- To avoid loaded scene unconsistencies we propose to lock the scene when a user after editing starts to save and unlock it after the save operation is completed. 
- Loading a scene requires that the scene is not locked by a save operation.

## Overview

This document defines the core concepts for the annotation system. It introduces a decomposed, relational data model.

The model separates three concepts:

- **Spatial placement** — where in 3D space the annotation is anchored, and to which scene or asset it refers (`annotationGeometry`)
- **Semantic content** — what the annotation conveys (`annotationData`)
- **Association** — the explicit, immutable link between **a single spatial anchor and a single semantic content** record (`annotationLink`)

A single geometry element can be associated with multiple annotation data records; a single annotation data record can be applied to multiple geometry elements. The `annotationLink` entity makes each association explicit, queryable, and independently manageable.

![Diagram illustrating the data model and relationships](media/annotation-model.svg)

### Entity summary

| Entity | Role |
| --- | --- |
| `annotationGeometry` | Standalone 3D geometric shape anchored to a scene or asset |
| `annotationData` | Standalone semantic content, optionally scoped to a specific scene |
| `annotationLink` | Immutable join entity associating one geometry node with one data record |

The entities are stored in the following collections:

- `annotationGeometry`
- `annotationData`
- `annotationLink`

### Project-based collections

All the collection entries have a `projectId` field, that identifies the project they belong to. This allows querying the collections for a specific project.
Without the project id, it would be impossible to distinguish between annotations of different projects. 

### API levels
The collections are accessed through a two-level API. 
The Low-Level DB Operations allow to modify the single entities, while the High-Level API provides a higher-level interface to manage annotations as a whole, keeping the integrity of the associations.

---

## Data Model

### `annotationGeometry`

`annotationGeometry` is an independent entity that defines the 3D geometric shape of an annotation anchor and its binding to a scene or asset. It is composed of one or more shapes of possibly different types. It has information expressing its reference frame, that can be a scene or an asset. It is the spatial anchor of an annotation.

#### Fields

- `id: string`  
  Unique identifier of the geometry element within the project.

- `projectId: string`  
  Identifier of the project this geometry belongs to.

- `shapes: array of shape`: array of 3D shapes, geometric primitives that together define an annotation anchor. Each element is an object defining a 3D shape. It contains:
  - `type`: the type of the primitive.
  - data specific to the primitive type.
  A single `annotationGeometry` may contain one or more shapes of any combination of types. The simple case is a single-element `shapes` array. Heterogeneous groups (e.g. a polygon and a set of sample points) are expressed by including multiple shapes in the array.

- `referenceType: "scene" | "asset"`  
  Indicates whether this geometry is anchored to a scene or to a digital asset, defining the reference space for its coordinates and its visibility scope.

- `referenceId: string`  
  Identifier of the target `HDTScene` or `DigitalAsset`, depending on `referenceType`. This field determines the 3D reference space in which shapes coordinates are expressed, and controls scene visibility.

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`

#### Shape types (examples)

Currently supported shape types:

| `type` | Description | `data` cardinality | Notes |
| --- | --- | --- | --- |
| `points` | Single point or multipoint | At least one `[x, y, z]` | `vertices.length == 1` is a single point; `vertices.length > 1` is a multipoint (disjoint sample locations) |
| `polyline` | Ordered open line | At least two `[x, y, z]` | |
| `polygon` | Ordered closed area | At least three `[x, y, z]` | Closure is implicit at application level |

All coordinates are expressed in the 3D reference space of the entity identified by `referenceId`.

#### Invariants

- `projectId` must be a valid, existing project identifier.
- `referenceType` must be `"scene"` or `"asset"`.
- `referenceId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` at the time of creation.
- `shapes` must be a non-empty array of valid shapes.

#### JSON example

```json
{
    "id": "geom_abc123",
    "projectId": "proj_xyz987",
    "shapes": [
        {
            "type": "polygon",
            "vertices": [
                [0.42, 0.31, 0.12],
                [0.44, 0.31, 0.12],
                [0.44, 0.33, 0.12],
                [0.42, 0.33, 0.12]
            ]
        },
        {
            "type": "points",
            "vertices": [
                [0.43, 0.32, 0.12],
                [0.435, 0.315, 0.12]
            ]
        }
    ],
    "referenceType": "scene",
    "referenceId": "scene_id_main",
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
  Identifier of the target `HDTScene` or `DigitalAsset`, depending on `referenceType`. This field determines the id of the scene or asset context in which this annotation data is visible, and must be consistent with the reference id of any geometry it is linked to.

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`

#### Invariants
- `projectId` must be a valid, existing project identifier.
- `label` must be a non-empty string.

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
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`

#### Invariants
1. `projectId` must be a valid, existing project identifier.

2. **Referential integrity**  
   Both `annotationGeometry` and `annotationData` must reference existing entities at the time of creation and must remain valid throughout the link's lifetime.

3. **Uniqueness**  
  The pair (`annotationGeometry`, `annotationData`) must be unique within the system. A geometry element may not be linked to the same annotation data record more than once.

4. **Scene consistency**  
   Only certain combinations of `annotationGeometry.referenceType`, `annotationGeometry.referenceId`, `annotationData.visibilityType` and `annotationData.visibilityId` are allowed. 
   In this table scene consistency conditions are represented within the Consistency column.

<a id="annotationlink-scene-consistency-table"></a>AnnotationLink scene consistency table:
| Geometry<br>referenceType | Data<br>visibilityType | Consistency | Visibility |
| --- | --- | --- | --- |
| `"scene"` | `"scene"` | `referenceId` must equal `visibilityId` | single scene |
| `"scene"` | `"asset"` | `referenceId` must be the id of a scene that contains the asset<br>referenced by `visibilityId` | single scene<br>active asset |
| `"asset"` | `"scene"` | `referenceId` must be the id of an asset contained in the scene<br>referenced by `visibilityId` | single scene<br>active asset |
| `"asset"` | `"asset"` | `referenceId` must equal `visibilityId` | multiple scenes<br>single asset |



#### JSON example

```json
{
    "id": "link_ghi789",
    "projectId": "proj_xyz987",
    "annotationGeometry": "geom_abc123",
    "annotationData": "data_def456",
    "createdAt": "2026-03-11T10:00:00.000Z",
    "createdBy": "user-id-1",
    "updatedAt": "2026-03-11T10:00:00.000Z",
    "updatedBy": "user-id-1"
}
```

---


## Scene Annotation Index
<span style="color:red">FIXME Consider removing the Annotation Index</span>. Is it needed, or is better to build the annotation list on the fly?

### Purpose and derivation

The scene annotation index is a derived data structure that enables fast retrieval of the annotations visible in a given scene. It is not a ground truth: it can always be rebuilt from the project-level stores of `annotationGeometry`, `annotationData`, and `annotationLink`.

Evaluate if needed: it can speed up the retrieval of annotations visible in a given scene, but it adds complexity to the system updates.

A geometry element (and any associated link) is visible in a scene according to the following rule:

| `referenceType` | `referenceId` | Condition for inclusion in scene index |
| --- | --- | --- |
| `"scene"` | `sceneId` | `sceneId == currentScene.id` |
| `"asset"` | `assetId` | The asset `assetId` is present in `currentScene` |

### Index maintenance

- When an `annotationGeometry` is **created**, its id must be added to the index of the affected scene(s).
- When an `annotationGeometry` is **deleted**, its id must be removed from the index of the affected scene(s).
- When an `annotationLink` is created or deleted, the scene annotation index is not directly modified: the index is based on geometry presence, not on link presence.
- When a **scene is deleted**, its scene annotation index is removed entirely. All `annotationGeometry` elements with `referenceType == "scene"` and `referenceId == deletedScene.id` must be handled according to the deletion policy described in the operations section.

### Index rebuild

The index for a given scene can be rebuilt at any time by scanning all `annotationGeometry` records and applying the visibility rules above. This operation is idempotent and can be used to recover from inconsistent states.

---

## Queries

### Read operations
DB queries provide functions to retrieve data from the databases and to support high-level operations.

#### `getAnnotation(linkId)`

Returns a single `annotation` constituted by the `annotationLink`, `annotationData` and `annotationGeometry` records, identified by `linkId`.



#### `getAnnotationLink(linkId)`

Returns a single `annotationLink` by identifier

---

#### `getLinksForScene(sceneId)`

Returns all `annotationLink` records visible in a given scene.

A link is visible in a scene if its referenced `annotationGeometry` satisfies either of these conditions:

- `referenceType == "scene"` and `referenceId == sceneId`
- `referenceType == "asset"` and `referenceId` identifies an asset contained in the scene

Previous conditions must be in sync with the scene consistency conditions described in the `annotationLink` section.

This query is resolved from the scene annotation index or by rebuilding it from the geometry store when needed. It should retrieve all the geometry annotations that are visible in the given scene, the associated links and the data annotations.


---

#### `getLinksForAsset(assetId)`

Returns all `annotationLink` records whose referenced `annotationGeometry` has `referenceType == "asset"` and `referenceId == assetId`. This is a global lookup across all scenes.

---

#### `getLinksForProject(projectId)`

Returns all `annotationLink` records associated with a given project. This is a full scan of the project-level annotation stores.

---

#### `getLinksForGeometry(geometryId)`

Returns all `annotationLink` records that reference a given `annotationGeometry`. Useful for determining whether a geometry element is orphaned or still in use.

---

#### `getLinksForData(dataId)`

Returns all `annotationLink` records that reference a given `annotationData`. Useful for determining whether a data record is orphaned or still in use.

---

#### `getAnnotationGeometry(geometryId)`

Returns a single `annotationGeometry` element by identifier.

---

#### `getAnnotationData(dataId)`

Returns a single `annotationData` element by identifier.

---


#### `getAnnotationDataAuditInfo(dataId)`

Returns the audit fields for a given `annotationData` element: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. Intended for provenance and workflow tracking.

---

#### `getAnnotationGeometryAuditInfo(geometryId)`

Returns the audit fields for a given `annotationGeometry` element: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

---

#### `getAnnotationLinkAuditInfo(linkId)`

Returns the audit fields for a given `annotationLink` element: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

---

#### `getAnnotationsByShapeType(shapeType, sceneId?)`

<span style="color:red">FIXME Consider removing this function</span>

Returns all `annotationLink` records whose referenced `annotationGeometry` contains at least one shape of the given `type` (`"points"`, `"polyline"`, or `"polygon"`). Optionally filtered to a specific scene. Useful for retrieving all point-based annotations or all area annotations within a context.

---

#### `getAnnotationsByClass(class, sceneId?)`

Returns all `annotationLink` records whose associated `annotationData.class` matches the given value. Optionally filtered to a specific scene.

---

#### `getAnnotationsByLabel(label, sceneId?)`

Returns all `annotationLink` records whose associated `annotationData.label` matches or contains the given string. Optionally filtered to a specific scene.

---

#### `searchAnnotations(query, sceneId?)`

Full-text search over `annotationData.label` and `annotationData.description`. Returns matching `annotationLink` records. Optionally scoped to a scene.

---

#### `countAnnotationsByClass(sceneId?)`

Returns a frequency map of annotation counts grouped by `annotationData.class`. Optionally scoped to a scene. Useful for dashboards, statistics, and annotation coverage reports.

---

### Diagnostic operations

#### `getOrphanedLinks()`

Returns all `annotationLink` elements whose `annotationGeometry` or `annotationData` references do not exist. Intended for diagnostic and cleanup purposes.

---

#### `getOrphanedGeometries()`

Returns all `annotationGeometry` elements that are not referenced by any `annotationLink`. Intended for diagnostic and cleanup purposes.

---

#### `getOrphanedData()`

Returns all `annotationData` elements that are not referenced by any `annotationLink`. Intended for diagnostic and cleanup purposes.

---

## Low-level DB Operations

There are 3 DBs for annotations:

1. AnnotationGeometry DB
2. AnnotationData DB
3. AnnotationLink DB

The basic low-level supported operations are:

- Create
- Read
- Update
- Delete

Low-level operations interact with a single DB and keep it consistent with itself. They do not interact with other DBs, possibly breaking the system consistency.

While high-level operations interact with other DBs and keep the system consistent.
For high-level operations, see the high-level operations section. 

Operations outside of the Annotation management service (on projects, scenes, assets, etc.) are not considered here, but must be performed in order to keep the system consistent (e.g. when an asset is deleted, all annotationGeometry elements with referenceType == "asset" and referenceId == deletedAsset.id must be deleted).


### `annotationGeometry` operations

#### `createAnnotationGeometry(projectId, shapes, referenceType, referenceId) : string`

Creates a new `annotationGeometry` element. Return the annotationGeometry id

**Pre-conditions:**
- `projectId` must reference an existing project.
- `referenceType` must be `"scene"` or `"asset"`.
- `referenceId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` respectively.
- `shapes` must be a non-empty array.
- Each element of `shapes` must have a valid `type` and a `data` array satisfying the cardinality constraint for that type.

**Post-conditions:**
- `id` is contained into the AnnotationGeometry DB
- `id` is globally unique and immutable.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
3. Persist the element to the geometry store.
4. Add the new `id` to the scene annotation index of the affected scene(s).

**Returns:**
- `true` if the element was created.
- `false` if the element already exists.

---

#### `updateAnnotationGeometryShapes(geometryId, newShapes) : boolean`
Updates the `shapes` field of an existing `annotationGeometry` element.

`shapes`: the update operation replace the old shape array with the new one. 

**Invariants:**
- `projectId` must be a valid, existing project identifier.
- `id` is globally unique and immutable.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- `newShapes` must be a non-empty array.

**Post-conditions:**
- `shapes` are updated


**System actions:**
1. Update `shapes`.
2. Update `updatedAt`, `updatedBy`.

**Returns:**
- `true` if the element was updated.
- `false` if the element does not exist.

---

#### `updateAnnotationGeometryReference(geometryId, newReferenceType, newReferenceId) : boolean`
Updates the `referenceType` and `referenceId` fields of an existing `annotationGeometry` element.

**Invariants:**
- `projectId` must be a valid, existing project identifier.
- `id` is globally unique and immutable.
- `geometryId` must reference an existing `annotationGeometry`.

**Pre-conditions:**
- `newReferenceType` must be `"scene"` or `"asset"`.
- `newReferenceId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` respectively. 
- `newReferenceType` and `newReferenceId` can change if they keep referencing content within the same scene. If  `newReferenceType` is `"scene"`, `newReferenceId` must be of the id of the current scene . If `newReferenceType` is `"asset"`, `newReferenceId` must be a valid, existing identifier of a `DigitalAsset`, and the asset must be present in the current scene.

**Post-conditions:**
- `referenceType` and `referenceId` are updated

**System actions:**
1. Update `referenceType` and `referenceId`.
2. Update `updatedAt`, `updatedBy`.

**Returns:**
- `true` if the element was updated.
- `false` if the element does not exist.

This is a low level operation. It does not check system consistency in particular it does not check AnnotationLink DB consistency, see [annotationLink scene consistency table](#annotationlink-scene-consistency-table).

---

#### `deleteAnnotationGeometry(geometryId) : boolean`

Deletes an `annotationGeometry` element from the store. It keeps the AnnotationGeometry DB valid, but it does not ensure the system consistency. 

This is a low-level operation. Before invoking it directly, all `annotationLink` records referencing this geometry must have been resolved. 
In practice, this operation is typically invoked as part of an `annotationLink` deletion sequence (shallow or deep) rather than independently.

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- No `annotationLink` must reference this `geometryId` at the time of deletion.

**Post-conditions:**
- `id` is not contained into the AnnotationGeometry DB.

**System actions:**
1. Remove the element from the geometry store.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

### `annotationData` operations

#### `createAnnotationData(projectId, label, description, class, visibilityType, visibilityId) : string`

Creates a new `annotationData` element. Return the annotationData id

**Pre-conditions:**
- `projectId` must reference an existing project.
- `label` must be a non-empty string.
- If `visibilityType` is "scene", `visibilityId` must be a valid existing `sceneId`.
- If `visibilityType` is "asset", `visibilityId` must be a valid existing `assetId`.

**Post-conditions:**
- `id` is contained into the AnnotationData DB.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
3. Persist the element to the data store.

**Returns:**
- `true` if the element was created.
- `false` if the element already exists.

---

#### `updateAnnotationData(dataId, label, description, class, content) : boolean` 

Updates one or more mutable fields of an `annotationData` element.

**Permitted fields:** `label`, `description`, `class`, `content` changing these fields does not affect the system consistency.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.
- If `label` is included in the patch, it must be a non-empty string.


**System actions:**
1. Apply the patch to the permitted fields only.
2. Update `updatedAt`, `updatedBy`.

**Returns:**
- `true` if the element was updated.
- `false` if the element does not exist.

---

#### `updateAnnotationDataVisibility(dataId, newVisibilityType, newVisibilityId) : boolean`
Updates the `visibilityType` and `visibilityId` fields of an existing `annotationData` element.

**Invariants:**
- `projectId` must be a valid, existing project identifier.
- `id` is globally unique and immutable.
- `dataId` must reference an existing `annotationData`.

**Pre-conditions:**
- `newVisibilityType` must be `"scene"` or `"asset"`.
- `newVisibilityId` must be a valid, existing identifier of an `HDTScene` or `DigitalAsset` respectively. 
- `newVisibilityType` and `newVisibilityId` can change if they keep referencing content within the same scene. If  `newVisibilityType` is `"scene"`, `newVisibilityId` must be of the id of the current scene . If `newVisibilityType` is `"asset"`, `newVisibilityId` must be a valid, existing identifier of a `DigitalAsset`, and the asset must be present in the current scene.

**Post-conditions:**
- `visibilityType` and `visibilityId` are updated

**System actions:**
1. Update `visibilityType` and `visibilityId`.
2. Update `updatedAt`, `updatedBy`.

**Returns:**
- `true` if the element was updated.
- `false` if the element does not exist.

This is a low level operation. It does not check system consistency in particular it does not check AnnotationLink DB consistency, see [annotationLink scene consistency table](#annotationlink-scene-consistency-table).
---

#### `deleteAnnotationData(dataId) : boolean` 

Deletes an `annotationData` element from the store. It keeps the AnnotationData DB consistent, but it does not ensure the system consistency. 

As with `deleteAnnotationGeometry`, this is a low-level operation. All `annotationLink` records referencing this data element must have been resolved before invocation.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.

**Post-conditions:**
- `dataId` is not contained into the AnnotationData DB.

**System actions:**
1. Remove the element from the data store.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

### `annotationLink` operations

#### `createAnnotationLink(projectId, annotationGeometryId, annotationDataId): string`

Creates a new `annotationLink` associating one `annotationGeometry` element with one `annotationData` record. Return the annotationLink id or null if it already exists.

**Pre-conditions (all must hold):**

1. `projectId` must reference an existing project.
2. `annotationGeometryId` must reference an existing `annotationGeometry` belonging to the same project.
3. `annotationDataId` must reference an existing `annotationData` belonging to the same project.
3. The pair (`annotationGeometryId`, `annotationDataId`) must not already exist as a link.
4. **Scene consistency**: 
- must satisfy the same scene consistency constraints defined in the [annotationLink scene consistency table](#annotationlink-scene-consistency-table).

**Post-conditions:**
- `linkId` is contained into the AnnotationLink DB.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
3. Persist the link to the link store.

**Returns:**
- `linkId` if the element was created.
- `null` if the element already exists.

---

#### (No update operation)

`annotationLink` is immutable after creation. No fields may be modified.

To change an association, delete the existing link and create a new one.

---
#### `deleteAnnotationLink(linkId) : boolean`

Deletes the `annotationLink` only. It keeps the AnnotationLink DB consistent, but it does not ensure the system consistency: dangling references may remain.  

**Pre-conditions:**
- `linkId` must reference an existing `annotationLink`.

**System actions:**
1. Remove the element from the link store.

**Post-conditions:**
- `linkId` is not contained into the AnnotationLink DB.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

## High-level operations

### Delete operations

#### `deleteAnnotationLinkDeep(linkId) : boolean`

Deletes the `annotationLink` and performs conditional cleanup of the associated `annotationGeometry` and `annotationData`, based on whether they are no longer referenced by any other link.

**Pre-conditions:**
- `linkId` must reference an existing `annotationLink`.

**Post-conditions:**
- `linkId` is not contained into the AnnotationLink DB.
- `annotationGeometryId` and `annotationDataId` are not contained into the AnnotationGeometry and AnnotationData DBs, respectively, if they are no longer referenced by any other link.

**System actions:**

1. Resolve the link: retrieve `geometryId` and `dataId`.
2. Delete the `annotationLink` record.
3. **Geometry cleanup:**
   - `getLinksForGeometry(geometryId)`
   - If no links remain: invoke `deleteAnnotationGeometry(geometryId)`.
   - Otherwise: leave the geometry in place.
4. **Data cleanup:**
   - `getLinksForData(dataId)`
   - If no links remain: invoke `deleteAnnotationData(dataId)`.
   - Otherwise: leave the data in place.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `deleteAnnotationGeometryDeep(geometryId)   : boolean`

Deletes the `annotationGeometry` and the associated `annotationLink` records if they exist. 
If the links are deleted, the associated `annotationData` is also deleted if it is no longer referenced by any other link.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.

**Post-conditions:**
- `geometry` is not contained into the AnnotationGeometry DB.
- `annotationLink` records are not contained into the AnnotationLink DB, if they exist.
- `annotationData` referred by the deleted links are not contained into the AnnotationData DB, if they are no longer referenced by any other link.

**System actions:**

1. **Retrieve links:** `links = getLinksForGeometry(geometryId)`
2. **If no links exist:** invoke `deleteAnnotationGeometry(geometryId)`
3. **Otherwise, cascade delete links:** For each `link` in `links`:
   - Invoke `deleteAnnotationLinkDeep(link.id)` (This inherently cleans up the base geometry on the final iteration, and removes any orphaned data).

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `deleteAnnotationDataDeep(dataId)   : boolean`

Deletes the `annotationData` and the associated `annotationLink` records if they exist. 
If the links are deleted, the associated `annotationGeometry` is also deleted if it is no longer referenced by any other link.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.

**Post-conditions:**
- `data` is not contained into the AnnotationData DB.
- `annotationLink` records are not contained into the AnnotationLink DB, if they exist.
- `annotationGeometry` referred by the deleted links are not contained into the AnnotationGeometry DB, if they are no longer referenced by any other link.

**System actions:**

1. **Retrieve links:** `links = getLinksForData(dataId)`
2. **If no links exist:** invoke `deleteAnnotationData(dataId)`
3. **Otherwise, cascade delete links:** For each `link` in `links`:
   - Invoke `deleteAnnotationLinkDeep(link.id)` (This inherently cleans up the base data on the final iteration, and removes any orphaned geometry).

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---


## Utilities

#### `removeAnnotationsWithProject(projectId) : boolean`

Removes all annotations associated with a given project.

**Pre-conditions:**
- `projectId` must reference an existing project.

**Post-conditions:**
- All annotations associated with the project are removed.

**System actions:**

1. Find all `annotationLink` using `getLinksForProject(projectId)`.
2. For each such link, invoke `deleteAnnotationLinkDeep`.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `removeAnnotationsWithScene(sceneId) : boolean`

Removes all annotations associated with a given scene.

**Pre-conditions:**
- `sceneId` must reference an existing scene.

**Post-conditions:**
- All annotations associated with the scene are removed.

**System actions:**

1. Find all `annotationLink` using `getLinksForScene(sceneId)`.
2. For each such link, invoke `deleteAnnotationLinkDeep`.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `removeAnnotationsWithAsset(assetId) : boolean`

Removes all annotations associated with a given asset.

**Pre-conditions:**
- `assetId` must reference an existing asset.

**Post-conditions:**
- All annotations associated with the asset are removed.

**System actions:**

1. Find all `annotationLink` using `getLinksForAsset(assetId)`.
2. For each such link, invoke `deleteAnnotationLinkDeep`.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.


---

### Maintenance operations

#### `rebuildSceneAnnotationIndex(sceneId)`

Reconstructs the scene annotation index for a given scene from the ground truth geometry store by applying the visibility rules. Idempotent. Used after bulk operations, crashes, or data migrations to ensure index correctness.

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

Deletes all `annotationGeometry` elements not referenced by any `annotationLink`. Updates affected scene annotation indexes. Safe to invoke during maintenance windows after bulk deletions.

---

#### `deleteOrphanedData()`

Deletes all `annotationData` elements not referenced by any `annotationLink`. 

---

#### `onSceneDeletion(sceneId)`

Handles all cascading cleanup when a scene is deleted.

**Sequence:**

1. Remove the scene annotation index.
2. Find all `annotationGeometry` using `getGeometriesForScene(sceneId)`.
3. Invoke `deleteAnnotationGeometryDeep` for each geometry identified in step 2.
4. Remove from all other scene annotation indexes any `annotationGeometry` id that was deleted in step 3.
5. Find all `annotationData` using `getDataForScene(sceneId)`.
6. Invoke `deleteAnnotationDataDeep` for each data identified in step 5.
7. Remove from all other scene annotation indexes any `annotationData` id that was deleted in step 6.

> **Note:** `annotationGeometry` elements with `referenceType == "asset"` are not affected by scene deletion; they remain valid in all other scenes containing the same asset.

---

#### `onAssetDeletion(assetId)`

Handles all cascading cleanup when a digital asset is deleted.

**Sequence:**

1. Find all `annotationGeometry` elements with `referenceType == "asset"` and `referenceId == assetId`.
2. For each such geometry, resolve and delete all associated `annotationLink` records (shallow or deep, according to policy).
3. Invoke `deleteAnnotationGeometry` for each geometry identified in step 1.
4. Update all scene annotation indexes that referenced those geometries.

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
- Rebuilding scene annotation indexes after a crash or migration
- Exporting all annotations for a scene for external reporting

---
