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

## Basic Concepts
- An asset has its own unique ID, its own reference system, and a digital representation that must specify its type (2D, 3D) and provide methods for drawing itself (and selecting areas, etc.).
- A scene has its own unique ID, its own reference system, and refers to two sets of assets, positioned in this reference system. The first set is made up of "editable" assets (i.e., assets that can have annotation modifications), the second of the others.
- An asset can be shared between multiple scenes.
- An annotation geometry is a geometric region, expressed either in the reference of a scene or in the reference of an asset.
- An annotation data is a semantic description, which is either relative to an asset or a scene. If relative to an asset, it is visible in all scenes containing it; if relative to a scene, it is visible only in that scene.
- An annotation link is a relationship between annotation geometry and annotation data.
- The operations allowed by Ocra are scene structuring, viewing, and editing.
- Structure consists of creating/destroying scenes, adding/removing assets from scenes or making them editable or not, positioning assets, etc.
- Viewing consists of exploring assets and their annotations.
- Editing consists of adding/removing/modifying annotation geometry, annotation data, and annotation links.
- Concurrency Rule 1: When a structuring operation is in progress, everything else is blocked until the end. No other structuring/editing/viewing operations.
- Concurrency Rule 2: I can always view every scene when a structuring operation is not in progress, regardless of other editing/viewing operations. A local copy is loaded and displayed.
- Concurrency Rule 3: I can edit a scene only if the editable assets it contains are not currently being edited. Therefore: only one active editor for the scene and blocking all editing of scenes containing editable assets present in this scene.
- The above concurrency rules should be implemented with database locks (to protect concurrent access) and checks for operation feasibility. Once the operation is started, there should be no concurrent access, since multiple writes to the same structure are prevented by the rules and invariants must be maintained.


## Note on concurrency
⚠️ These concepts could be moved to `data-model.md`.

To guarantee higher concurrency each scene is constituted by 
- editable assets
- background assets

While the editable assets can be edited, the background assets serve as context and can be only viewed.
In the scene description each assets has an `editable` boolean flag to mark it as editable.

In a scene only the asset marked as `editable` can be edited.

## Workflows
⚠️ These concepts could be moved to `workflow.md`

Before deepening into Annotations, we propose the following workflows showing how user can interact with the framework.
The presented workflows allows to perform the main operations without a fine-grained concurrency management.

The basic idea is to simply avoid situations where multiple users are editing the same contents at the same time. 
When the user start an edit session on some contents, these contents are locked and no other user can modify them.

There are two types of data: project level data (HDTs, scenes, assets) and annotation data.

### Concurrency Rule 1, scene structuting: project level data (HDTs, scenes, assets) creation, modification and deletion
- Project level data can be edited only by `Admin` or `Creator` or `Project Manager`.
- During the creation or modification of an HDT, scene or asset properties, no other user can access the data neither to read nor to write.
- On editing a project level data, the data is locked for reading and writing for all users. 

### Concurrency Rule 2, annotation editing: scene and asset annotations creation, modification and deletion
- `Editor` or user with higher privileges can create, modify or delete annotations in a scene.
- When scene annotations are edited by a user, no other user can edit the same scene annotations.
- When asset annotations are edited by a user, no other user can edit the same asset annotations.
- To permit a higher concurrency level, we propose to add a static `editable` flag associated to scene asset entries. We thus can have multiple scenes, containing the same assets.
- If the scene asset is marked as editable, the asset annotations can be edited.
- The annotations of these assets can be edited in multiple scenes, but only one user can edit the annotations of a specific asset at a time.
- If multiple scenes have the same asset marked as editable, the first scene that is opened in `edit` mode will have the exclusive right to edit the editable asset annotations. 
- If a scene contains an asset that is currently edited, other scenes with the same asset marked as editable, cannot be opened in `edit` mode
- When a user open in `edit` mode a scene, that scene and all the scenes containing one of the editable assets of that scene are locked for editing for all users.

### Concurrency Rule 3, scene viewing
- All users can view a scene.
- A scene can be loaded only if it's not under scene structuring operations (Concurrency Rule 1).
- To avoid loading scene inconsistencies we propose to lock the scene before start saving and unlock it after the save operation is completed. 
- Multiple users can view the same scene at the same time
- If the annotations of a scene are edited by a user, other user can still view the scene. 
- When a user loads the scene, it will load the version of the scene  with the last saved modifications. 
- After a scene is loaded for viewing, the changes made by other users will not be visible until the scene is reloaded.   

## Overview

### Entity summary

| Entity | Role |
| --- | --- |
| `annotationGeometry` | Standalone 3D geometric shapes relative to a scene or an asset |
| `annotationData` | Standalone semantic content relative to a scene or an asset |
| `annotationLink` | Immutable join entity associating one geometry node with one data record |

The entities are stored in the corresponding collections.

![Diagram illustrating the data model and relationships](media/annotation-model.svg)


<a id="annotationlink-scene-consistency-table"></a>AnnotationLink scene consistency table, considering the relative position of the geometry and data to a scene or an asset
| Geometry<br>relative to | Data<br>relative to | Consistency | Visibility |
| --- | --- | --- | --- |
| `"scene"` | `"scene"` | `geometry scene id` == ` data scene id` | single scene |
| `"scene"` | `"asset"` | `geometry scene contains data asset` | single scene<br>active asset |
| `"asset"` | `"scene"` | `geometry asset is contained in data scene` | single scene<br>active asset |
| `"asset"` | `"asset"` | `geometry asset id` == ` data asset id` | multiple scenes<br>single asset |


The `annotationLink` permits to express annotations as a many-to-many relationship between geometry element and data element. 
A single geometry element can be associated with multiple annotation data records; a single annotation data record can be applied to multiple geometry elements. A single `annotationLink` entity expresses a one-to-one association between a geometry element and a data element.
When an annotation is edited the operation has impact on a limited set of scenes: the specified scene or the scenes that contain the specified asset. 


### Project-based collections

All the collection entries have a `projectId` field, that identifies the project they belong to. This allows querying the collections for a specific project.
Without the project id, it would be impossible to distinguish between annotations of different projects. 

### API levels
The collections are accessed through a two-level API. 
The Low-Level DB Operations allow to modify the single entities, while the High-Level API provides a higher-level interface to manage annotations as a whole, keeping the integrity of the associations.

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

- `createdAt: ISO 8601 timestamp`  
- `createdBy: user id`  
- `updatedAt: ISO 8601 timestamp`  
- `updatedBy: user id`


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

### Annotation

An `annotation` is a composite entity that groups together an `annotationLink`, an `annotationData` record, and an `annotationGeometry` record.

Querying for annotations begins by retrieving annotationLink records. The associated `annotationData` and `annotationGeometry` records are then fetched and bundled together into a single `Annotation` object

#### JSON example

```json
{
    "link": {
      "id": "link_ghi789",
      "projectId": "proj_xyz987",
      "annotationGeometry": "geom_abc123",
      "annotationData": "data_def456",
      "createdAt": "2026-03-11T10:00:00.000Z",
      "createdBy": "user-id-1"
    },
    "geometry": {
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
            }
        ],
        "referenceType": "scene",
        "referenceId": "scene_id_main",
        "createdAt": "2026-03-11T10:00:00.000Z",
        "createdBy": "user-id-1",
        "updatedAt": "2026-03-11T10:00:00.000Z",
        "updatedBy": "user-id-1"
    },
    "data": {
        "id": "data_def456",
        "projectId": "proj_xyz987",
        "label": "Lacuna",
        "description": "Small loss of material on the lower left area.",
        "class": "damage",
        "content": {},
        "visibilityType": "scene",
        "visibilityId": "scene_id_main",
        "createdAt": "2026-03-11T10:00:00.000Z",
        "createdBy": "user-id-1",
        "updatedAt": "2026-03-11T10:00:00.000Z",
        "updatedBy": "user-id-1"
    }
}
```

## Queries

### Load

#### `startReading(projectId, sceneId): boolean`

Call this function to see if the scene can be read (there are no locks on the scene).

Returns `true` if the user is allowed to read the scene, `false` otherwise.

It is used to check if the user is allowed to read the scene before loading it.
A scene can be locked for reading if there are Project level edit operations (e.g. HDT publish) in progress.

#### `stopReading(projectId, sceneId): void`

Called after reading is finished. Currently do nothing (but it could be used to unlock the scene if it was locked for reading) 

#### `startEditing(projectId, sceneId): boolean`

Call this function to see if the scene can be edited (there are no locks on the scene).

Returns `true` if the user is allowed to edit the scene, `false` otherwise.

If it return true, it locks the scene and the contained editable assets. Their annotations cannot be edited by other users until the scene is unlocked. 

It is used to check if the user is allowed to edit the scene before loading it.
A scene can be locked for editing if there are Project level operations (e.g. HDT publish) in progress or if other users are editing the annotations of the scene or the annotations of assets which are part of the scene and are marked as `editable`.


#### `stopEditing(projectId, sceneId): void`

Called after editing is finished. It unlocks the scene and the contained editable assets. 

DB queries provide functions to retrieve data from the databases and to support high-level operations.

### Helper functions

#### `annotationGeometryBelongsToScene(projectId, geometryId, sceneId, sceneAssetIds[]): boolean`

Returns `true` if one of the following conditions is satisfied:
- `referenceType == "scene"` and `referenceId == sceneId`
- `referenceType == "asset"` and `referenceId` identifies an asset contained in the scene

---

#### `annotationDataBelongsToScene(projectId, dataId, sceneId, sceneAssetIds[]): boolean`

Returns `true` if one of the following conditions is satisfied:
- `visibilityType == "scene"` and `visibilityId == sceneId`
- `visibilityType == "asset"` and `visibilityId` identifies an asset contained in the scene

### Read operations: return annotationLinks

These functions return an `annotationLink` object and are executed just searching the `annotationLink` collection.

#### `getAnnotationLink(projectId, linkId): annotationLink`

Returns a single `annotationLink` identified by `linkId`

---

#### `getAnnotationLinksForProject(projectId): annotationLink[]`

Returns all `annotationLink` records associated with a given project. This is a full scan of the project-level annotation stores.

---

#### `getAnnotationLinksForGeometry(projectId, geometryId): annotationLink[]`

Returns all `annotationLink` records that reference a given `annotationGeometry`. Useful for determining whether a geometry element is orphaned or still in use.

---

#### `getAnnotationLinksForData(projectId, dataId): annotationLink[]`

Returns all `annotationLink` records that reference a given `annotationData`. Useful for determining whether a data record is orphaned or still in use.

---

#### `getAnnotationLinkAuditInfo(projectId, linkId) : {createdAt, createdBy}`

Returns the audit fields for a given `annotationLink` element: `createdAt`, `createdBy`.

---


### Read operations: return Annotation

These functions directly return a complete `Annotation` object, composed of an `annotationLink`, `annotationData` and `annotationGeometry` record. 

#### `getAnnotation(projectId, linkId): Annotation`

Returns a single `Annotation` identified by `linkId`

---

#### `getAnnotationsForScene(projectId, sceneId, sceneAssetIds[]): Annotation[]`

Returns all `Annotation` records visible in a given scene.
Each annotation is composed of an `annotationLink`, `annotationData` and `annotationGeometry` record.

An annotation is visible in a scene if **both** of the following conditions are satisfied:
- `annotationGeometryBelongsToScene(geometryId, sceneId, sceneAssetIds)` is true
- `annotationDataBelongsToScene(dataId, sceneId, sceneAssetIds)` is true

These conditions must align with the scene consistency rules defined in the `annotationLink` section.
 
---

#### `getAnnotationGeometriesForScene(projectId, sceneId, sceneAssetIds[]) : annotationGeometry[]`

Returns all `annotationGeometry` elements belonging to a given scene.

A geometry element belongs to a scene if `annotationGeometryBelongsToScene(geometryId, sceneId, sceneAssetIds)` is true.

It retrieves all geometry annotations belonging to the specified scene.

---

#### `getAnnotationDataForScene(projectId, sceneId, sceneAssetIds[]) : annotationData[]`

Returns all `annotationData` elements belonging to a given scene.

A data element belongs to a scene if `annotationDataBelongsToScene(dataId, sceneId, sceneAssetIds)` is true.
It retrieves all annotationData belonging to the specified scene.

---

#### `getAnnotationGeometriesForAsset(projectId, assetId): annotationGeometry[]`

Returns all `annotationGeometry` elements belonging to a given asset.

A geometry element belongs to an asset if `referenceType == "asset"` and `referenceId == assetId`.

It retrieves all geometry annotations belonging to the specified asset.

#### `getAnnotationDataForAsset(projectId, assetId): annotationData[]`

Returns all `annotationData` elements belonging to a given asset.

A data element belongs to an asset if `visibilityType == "asset"` and `visibilityId == assetId`.

It retrieves all data annotations belonging to the specified asset.

#### `getAnnotationsForAsset(projectId, assetId): Annotation[]`

Returns all `Annotation` records that reference the given asset.

Could be implemented as:
- geometry = `getAnnotationGeometriesForAsset(projectId, assetId)`
- data = `getAnnotationDataForAsset(projectId, assetId)`
- links = find all the links that reference the given geometry or data records
- return assembled annotations made of `annotationLink`, `annotationData` and `annotationGeometry`

This is a global lookup across all scenes.

---

#### `getAnnotationGeometry(projectId, geometryId) : annotationGeometry`

Returns a single `annotationGeometry` element by identifier.

---

#### `getAnnotationData(projectId, dataId) : annotationData`

Returns a single `annotationData` element by identifier.

---


#### `getAnnotationDataAuditInfo(projectId, dataId) : {createdAt, createdBy, updatedAt, updatedBy}`

Returns the audit fields for a given `annotationData` element: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. Intended for provenance and workflow tracking.

---

#### `getAnnotationGeometryAuditInfo(projectId, geometryId) : {createdAt, createdBy, updatedAt, updatedBy}`

Returns the audit fields for a given `annotationGeometry` element: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

---

#### `getAnnotationsByClass(projectId, class, sceneId?, sceneAssetIds[]) : Annotation[]`

Returns all `Annotation` records whose associated `annotationData.class` matches the given value. Optionally filtered to a specific scene.

---

#### `getAnnotationsByLabel(projectId, label, sceneId?, sceneAssetIds[]) : Annotation[]`

Returns all `Annotation` records whose associated `annotationData.label` matches or contains the given string. Optionally filtered to a specific scene.

---


#### `searchAnnotations(projectId, query, sceneId?, sceneAssetIds[]) : Annotation[]`

Full-text search over `annotationData.label` and `annotationData.description`. Returns matching `Annotation` records. Optionally scoped to a scene.

---

#### `countAnnotationsByClass(projectId, sceneId?, sceneAssetIds[])`

Returns a frequency map of annotation counts grouped by `annotationData.class`. Optionally scoped to a scene. Useful for dashboards, statistics, and annotation coverage reports.

---

### Diagnostic operations

#### `getAnnotationOrphanedLinks(projectId): annotationLink[]`

Returns all `annotationLink` elements whose `annotationGeometry` or `annotationData` references do not exist. Intended for diagnostic and cleanup purposes.

---

#### `getAnnotationOrphanedGeometries(projectId): annotationGeometry[]`

Returns all `annotationGeometry` elements that are not referenced by any `annotationLink`. Intended for diagnostic and cleanup purposes.

---

#### `getAnnotationOrphanedData(projectId): annotationData[]`

Returns all `annotationData` elements that are not referenced by any `annotationLink`. Intended for diagnostic and cleanup purposes.

---

## Low-level DB Operations

There are 3 collections for annotations:

1. annotationGeometry collection
2. annotationData collection
3. annotationLink collection

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
- `shapes` must be a non-empty array of valid Shape elements

**Post-conditions:**
- `projectId` is contained into the project DB
- `id` is contained into the annotationGeometry DB
- `id` is globally unique and immutable.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
3. Persist the element to the geometry store.

**Returns:**
- `id` if the element was created.
- `null` if the element already exists.

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

#### `deleteAnnotationGeometry(geometryId) : boolean`

Deletes an `annotationGeometry` element from the store. It keeps the annotationGeometry DB valid, but it does not ensure the system consistency. 

This is a low-level operation. Before invoking it directly, all `annotationLink` records referencing this geometry must have been resolved. 
In practice, this operation is typically invoked as part of an `annotationLink` deletion sequence (shallow or deep) rather than independently.

**Invariants:**
- `projectId` must reference an existing project.

**Pre-conditions:**
- `geometryId` must reference an existing `annotationGeometry`.
- No `annotationLink` must reference this `geometryId` at the time of deletion.

**Post-conditions:**
- `id` is not contained into the annotationGeometry DB.

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
- `id` is contained into the annotationData DB.

**System actions:**
1. Generate a new unique `id`.
2. Set `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
3. Persist the element to the data store.

**Returns:**
- `id` if the element was created.
- `null` if the element already exists.

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

#### `updateAnnotationDataVisibility(projectId, dataId, newVisibilityType, newVisibilityId) : boolean`
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

This is a low level operation. It does not check system consistency in particular it does not check annotationLink DB consistency, see [annotationLink scene consistency table](#annotationlink-scene-consistency-table).

---

#### `deleteAnnotationData(dataId) : boolean` 

Deletes an `annotationData` element from the store. It keeps the annotationData DB consistent, but it does not ensure the system consistency. 

As with `deleteAnnotationGeometry`, this is a low-level operation. All `annotationLink` records referencing this data element must have been resolved before invocation.

**Pre-conditions:**
- `dataId` must reference an existing `annotationData`.

**Post-conditions:**
- `dataId` is not contained into the annotationData DB.

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
#### `deleteAnnotationLink(linkId) : boolean`

Deletes the `annotationLink` only. It keeps the annotationLink DB consistent, but it does not ensure the system consistency: dangling references may remain.  

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

#### `deleteAnnotationLinkDeep(linkId) : boolean`

Deletes the `annotationLink` and performs conditional cleanup of the associated `annotationGeometry` and `annotationData`, based on whether they are no longer referenced by any other link.

**Pre-conditions:**
- `linkId` must reference an existing `annotationLink`.

**Post-conditions:**
- `linkId` is not contained into the annotationLink DB.
- `annotationGeometryId` and `annotationDataId` are not contained into the annotationGeometry and annotationData DBs, respectively, if they are no longer referenced by any other link.

**System actions:**

1. Resolve the link: retrieve `geometryId` and `dataId`.
2. Delete the `annotationLink` record.
3. **Geometry cleanup:**
   - `getAnnotationLinksForGeometry(geometryId)`
   - If no links remain: invoke `deleteAnnotationGeometry(geometryId)`.
   - Otherwise: leave the geometry in place.
4. **Data cleanup:**
   - `getAnnotationLinksForData(dataId)`
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
- `geometry` is not contained into the annotationGeometry DB.
- `annotationLink` records are not contained into the annotationLink DB, if they exist.
- `annotationData` referred by the deleted links are not contained into the annotationData DB, if they are no longer referenced by any other link.

**System actions:**

1. **Retrieve links:** `links = getAnnotationLinksForGeometry(geometryId)`
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
- `annotationLink` records are not contained into the annotationLink DB, if they exist.
- `annotationGeometry` referred by the deleted links are not contained into the annotationGeometry DB, if they are no longer referenced by any other link.

**System actions:**

1. **Retrieve links:** `links = getAnnotationLinksForData(dataId)`
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

1. Find all `annotationLink` using `getAnnotationLinksForProject(projectId)`.
2. For each such link, invoke `deleteAnnotationLinkDeep(link.id)`.

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.

---

#### `removeAnnotationsWithScene(sceneId) : boolean`

Removes all annotations natively anchored or scoped to the scene. This is a destructive operation that also affects annotations sharing an asset if their geometry or data is strictly scene-specific.

**Pre-conditions:**
- `sceneId` must reference an existing scene.

**Post-conditions:**
- All `annotationGeometry` explicitly referencing the scene are removed, along with their links.
- All `annotationData` explicitly visibly scoped to the scene are removed, along with their links.

**System actions:**

1. Find all `annotationGeometry` referencing the scene using `getAnnotationGeometriesForScene(sceneId, [])`. For each, invoke `deleteAnnotationGeometryDeep`.
2. Find all `annotationData` referencing the scene using `getAnnotationDataForScene(sceneId, [])`. For each, invoke `deleteAnnotationDataDeep`.

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
- All the annotationGeometry and annotationData that reference the asset are removed.

**System actions:**

1. Find all `Annotations` using `getAnnotationsForAsset(assetId)`.
2. For each such annotation, invoke `deleteAnnotationLinkDeep(annotation.link.id)`.
3. Find all orphaned `annotationGeometry` referencing `assetId` and delete them (via `deleteAnnotationGeometry`).
4. Find all orphaned `annotationData` referencing `assetId` and delete them (via `deleteAnnotationData`).

**Returns:**
- `true` if the element was deleted.
- `false` if the element does not exist.


---

### Maintenance operations

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
1. Invoke `removeAnnotationsWithScene(sceneId)`


---

#### `onAssetDeletion(assetId)`

Handles all cascading cleanup when a digital asset is deleted.

**Sequence:**

1. Invoke `removeAnnotationsWithAsset(assetId)`

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
