# Annotations in 3D Models

## Overview

This document defines our work in progress core concepts for annotations.
Starting from the [data-model.md](data-model.md), an annotation is a persistent entity that is stored within the annotation list of a `HDTProject`.
We tried to adhere as much as possible to the current model, but we also present here some changes and extensions that we consider useful.

### Proposal for a different annotation model

We also have considered a different annotation representation, considering an annotation as a relationship between geometry and annotation content. This would move from a one-to-one relationship between geometry and annotation content to a many-to-many relationship. 
A single geometry can be annotated by multiple annotation contents, and a single annotation content can be applied to multiple geometries. This is a proposal, but currently it is not further developed in this document. 

### Current annotation model

In the current model, an annotation is what is presented in the [data-model.md](data-model.md), but with a modification related to the scene and asset references.
An annotation has two references: a `sceneId` and an `assetId`.
Both can contain a value, but at least one of them must be set.
This table describes the possible combinations and their meaning.   

| sceneId | assetId | semantic target | Reference Frame | Visibility
| --- | --- | --- | --- | --- |
| null | null | invalid | invalid | invalid |
| id | null | HDTScene | HDTScene  |     only this scene |
| null | id | DigitalAsset | DigitalAsset | all scenes containing this asset |
| id | id | HDTScene and DigitalAsset | DigitalAsset | only this scene when asset is enabled |

---

The annotation contains also the following fields:  
- `annotationGeometry`: the geometric definition of the annotated entity in 3D space
- `annotationData`: the minimal semantic content shown to users
- `annotationParadata`: provenance and workflow metadata about how the annotation was created or modified
- information related to the user and date of creation and update


---

## `Annotation`

The `Annotation` (`HDTProject.annotations`) is the main entity of the annotation system.
Each annotation can be related to a scene or an asset or both.
The Annotation database is a list of annotations.
From this database is possible to retrieve the annotations related to a specific scene or asset.

- If an annotation is related to a scene, it will be visible in that scene.
- If an annotation is related to an asset, it will be visible in all scenes containing that asset.
- If an annotation is related to both a scene and an asset, it will be visible in the scene when the asset is enabled.

### Scene Annotation Index
A scene contains a list of annotation ids of the annotations that will appear in that scene. This list is called `annotations`.

This list is a derived scene annotation index for fast retrieval in the viewer. The ground truth remains the project-level annotation database `HDTProject.annotations`.

The scene annotation index can always be rebuilt from `HDTProject.annotations` by applying the visibility rules defined by `sceneId` and `assetId`.

In particular, an annotation belongs to the index of a scene if:

- `sceneId = currentScene.id`
- or `sceneId = null` and `assetId` identifies an asset contained in the current scene

### Annotation creation and deletion
When an annotation is created or deleted, the ground truth `HDTProject.annotations` list is updated first.
Then the scene annotation indexes (`HDTScene.annotations`) are updated accordingly.

### Annotation update
When an annotation is updated, the corresponding record in `HDTProject.annotations` is updated.
In general there is no need to modify scene annotation indexes if `sceneId` and `assetId` do not change.
If `sceneId` or `assetId` changes, the affected scene annotation indexes must be recomputed.

### Core fields

- `id`  
    Unique annotation identifier within the project.

- `sceneId`  
    Identifier of the HDTScene to which the annotation belongs | null if the annotation is not linked to a scene.

- `assetId`  
    Identifier of the DigitalAsset to which the annotation belongs | null if the annotation is not linked to an asset.

- `annotationGeometry`  
    Structured geometric definition of the annotated 3D entity.

- `annotationData`  
    Structured semantic content of the annotation.

- `annotationParadata`  
    Free-form metadata describing how the annotation was produced, updated, or interpreted.

- `annotationClass`  
    Optional classification label for the annotation, for example `damage`, `restoration`, `material`, `diagnostic`, etc.

### Audit fields

- `createdAt` — timestamp of creation
- `createdBy` — user id of the creator
- `updatedAt` — timestamp of last update
- `updatedBy` — user id of the last updater

### Logical structure

```json
{
    "id": "ann_xxxxx",
    "sceneId": "scene_id_main",
    "assetId": "asset_id_main",
    "annotationClass": "damage",
    "annotationGeometry": {
        "type": "point",
        "coordinates": [0.42, 0.31, 0.12]
    },
    "annotationData": {
        "label": "Lacuna",
        "description": "Small loss of material on the lower left area."
    },
    "annotationParadata": {
        "method": "manual",
        "tool": "OpenLIME"
    },
    "createdAt": "2026-03-11T10:00:00.000Z",
    "createdBy": "user-id-1",
    "updatedAt": "2026-03-11T10:00:00.000Z",
    "updatedBy": "user-id-1"
}
```

---

## `annotationData`

For the current version, `annotationData` is intentionally minimal and contains only the user-facing textual content of the annotation.

### Fields

- `label: string`  
    Short label or title of the annotation.

- `description: string`  
    Free-text description of the annotation.

### Current structure

```json
{
    "label": "Lacuna",
    "description": "Small loss of material on the lower left area."
}
```

### Notes

- `label` should be concise and suitable for lists, legends, and quick selection tools.
- `description` may contain a more detailed explanation.
- Future versions may extend `annotationData` with controlled vocabulary references or domain-specific fields.

---

## `annotationGeometry`

`annotationGeometry` defines the 3D geometric entity to which the annotation refers.

### Supported geometry types

The current model supports the following 3D geometry types:

- `point`
- `polyline`
- `polygon`

### Geometry coordinate model

Coordinates are expressed in the 3D reference space of the target scene or target asset.

#### Point

A single point in 3D space.

```json
{
    "type": "point",
    "coordinates": [x, y, z]
}
```

#### Polyline

An ordered list of 3D points representing an open line.

```json
{
    "type": "polyline",
    "coordinates": [
        [x1, y1, z1],
        [x2, y2, z2],
        [x3, y3, z3]
    ]
}
```

#### Polygon

An ordered list of 3D points representing a polygonal area.

```json
{
    "type": "polygon",
    "coordinates": [
        [x1, y1, z1],
        [x2, y2, z2],
        [x3, y3, z3],
        [x4, y4, z4]
    ]
}
```

### Validation rules

- `point` must contain exactly one 3D coordinate.
- `polyline` must contain at least two 3D points.
- `polygon` must contain at least three 3D points.
- All coordinates must be expressed in a consistent 3D reference space.
- Polygon closure may be treated as implicit at application level, unless the implementation explicitly requires the first and last point to coincide.

---

## `annotationParadata`

`annotationParadata` stores provenance and workflow-related information about the annotation.

Typical examples include:

- software tool used
- editing notes
- confidence or quality notes
- workflow state information

This field is intentionally free-form in the current version.

---

## Annotation lifecycle and audit rules

All write operations on annotations must update timestamps and authorship consistently.

### Ground truth and derived index rule

- `HDTProject.annotations` is the ground truth of the annotation database
- `HDTScene.annotations` is a derived scene annotation index of annotation ids used for scene-level retrieval and rendering
- scene annotation indexes must always be derivable from the project-level annotation database

This means that write operations must update the project-level annotation record first, and then update or rebuild the affected scene annotation indexes.

### On create

The system must:

- generate a new `annotation.id`
- set `createdAt`
- set `createdBy`
- set `updatedAt`
- set `updatedBy`

The following cases must then be handled:

- `sceneId = null`, `assetId = null`  
    Invalid. Annotation creation must be rejected.

- `sceneId = id`, `assetId = null`  
    Scene annotation. The annotation is inserted into `HDTProject.annotations` and its id is added to the index of that scene only.

- `sceneId = null`, `assetId = id`  
    Pure asset annotation. The annotation is inserted into `HDTProject.annotations` and its id is added to the index of all scenes containing that asset, including the current scene.

- `sceneId = id`, `assetId = id`  
    Scene-specific asset annotation. The annotation is inserted into `HDTProject.annotations` and its id is added only to the index of the specified scene. It is visible only in that scene, when the referenced asset is enabled there.

### On update

The system must:

- preserve `id`
- preserve `createdAt`
- preserve `createdBy`
- update `updatedAt`
- update `updatedBy`

### On partial update

For operations such as `updateGeometry`, `updateData`, `updateParadata`, and `updateClass`:

- only the targeted field must be modified
- `updatedAt` must be refreshed
- `updatedBy` must be refreshed
- all other fields must remain unchanged

### On delete

The system must:

- remove the annotation from the HDTProject `annotations` list
- remove the annotation from the indexes of all affected scenes
- remove any dependent reference to `annotation.id` if such references are maintained elsewhere in the HDT document

The affected scene annotation indexes depend on the annotation type:

- `sceneId = id`, `assetId = null`  
    Remove the annotation id from the index of that scene.

- `sceneId = null`, `assetId = id`  
    Remove the annotation id from the index of all scenes containing that asset.

- `sceneId = id`, `assetId = id`  
    Remove the annotation id from the index of that scene only.

### On remove from a scene

Removing an annotation from a scene means removing it from the scene annotation index and applying the appropriate rule according to its scope.

- If the annotation is a pure scene annotation (`sceneId = currentScene.id`, `assetId = null`), removing it from the scene means deleting the annotation itself from `HDTProject.annotations`.

- If the annotation is a pure asset annotation (`sceneId = null`, `assetId = id`), removing it from one scene means deleting the annotation itself from `HDTProject.annotations`, and therefore removing it from the cache of all scenes containing that asset.

- If the annotation is a scene-specific asset annotation (`sceneId = currentScene.id`, `assetId = id`), removing it from the scene means deleting the annotation itself from `HDTProject.annotations` and removing it from the index of that scene only.

### On scene deletion

When a scene is deleted:

- the scene annotation index `HDTScene.annotations` is removed with the scene
- all scene-local annotations of that scene must be deleted from `HDTProject.annotations`
- this includes:
    - pure scene annotations (`sceneId = deletedScene.id`, `assetId = null`)
    - scene-specific asset annotations (`sceneId = deletedScene.id`, `assetId = id`)
- pure asset annotations (`sceneId = null`, `assetId = id`) must not be deleted from `HDTProject.annotations`
- pure asset annotations simply disappear from the deleted scene because its scene annotation index is removed, but remain visible in all other scenes containing the same asset

---

## Annotation operations

The annotation store should support the following operations.

Within OCRA, the scene is the main retrieval context for annotations shown in the viewer.
For this reason, `getAnnotations(HDTScene.id)` should be understood as:

- return the annotation list owned by that scene
- regardless of whether each annotation targets the scene itself or one of the assets included in that scene

Operationally, this means returning the annotations referenced by the scene cache, or rebuilding that cache from `HDTProject.annotations` when needed.
Operationally, this means returning the annotations referenced by the scene annotation index, or rebuilding that index from `HDTProject.annotations` when needed.


### Write operations

- `create(annotation)`  
    Creates a new annotation and assigns `id`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`.
    It then updates the affected scene annotation indexes according to the `sceneId` / `assetId` combination.

- `update(annotation.id, patch)`  
    Updates one or more mutable fields of the annotation.
    If `sceneId` or `assetId` changes, the affected scene annotation indexes must be updated.

- `updateGeometry(annotation.id, annotationGeometry)`  
    Updates only `annotationGeometry`.

- `updateData(annotation.id, annotationData)`  
    Updates only `annotationData`.

- `updateParadata(annotation.id, annotationParadata)`  
    Updates only `annotationParadata`.

- `updateClass(annotation.id, annotationClass)`  
    Updates only `annotationClass`.

- `delete(annotation.id)`  
    Deletes the annotation.
    It then removes the annotation id from the affected scene annotation indexes.

- `removeFromScene(HDTScene.id, annotation.id)`  
    Removes an annotation from a scene according to its scope rules.
    Depending on the `sceneId` / `assetId` combination, this may imply deleting the annotation from the project-level annotation database and updating multiple scene annotation indexes.

- `deleteScene(HDTScene.id)`  
    Deletes the scene, removes its scene annotation index, deletes scene-local annotations from `HDTProject.annotations`, and preserves pure asset annotations that remain valid in other scenes.

### Read operations

- `getAnnotation(annotation.id)`  
    Returns a single annotation by identifier.

- `getAnnotations(HDTScene.id)`  
    Returns all annotations that compose a given scene.
    This is resolved from the scene annotation index or by rebuilding it from the project-level annotation database.

- `getAnnotations(DigitalAsset.id)`  
    Returns all annotations that target a given asset.
    This is a global lookup.

- `getAnnotations(HDTProject.id)`  
    Returns all annotations that compose the project.
    This is a global lookup.

- `getScenes(DigitalAsset.id)`  
    Returns all scenes that contain a given asset.

### Utility operations

- `getClass(annotation.id)`  
    Returns `annotationClass`.

- `getLabel(annotation.id)`  
    Returns `annotationData.label`.

- `getDescription(annotation.id)`  
    Returns `annotationData.description`.

### Typical access patterns

- retrieving a single annotation by `id`
- retrieving all annotations belonging to a given scene
- retrieving all annotations targeting a given asset
- retrieving all annotations of a given class within a target entity
- retrievnig all annotations of a given project
- retrieving all scenes containing a given asset

---

## `AnnotationGraph` (inside a scene, optional)

`AnnotationGraph` can be introduced later to represent explicit relationships between annotations.

For OCRA, a flexible and non-redundant approach is to treat:

- each `Annotation` in a scene as a graph node
- each relation between scene-local annotations as an explicit typed edge

This is preferable to storing structural pointers such as `up`, `down`, `prev`, and `next`, because those fields are more suitable for tree-like or sequential navigation, while OCRA may need more general semantic relationships.

### Minimal proposed structure

```json
{
    "relations": [
        {
            "id": "rel_001",
            "sourceId": "ann_001",
            "targetId": "ann_002",
            "type": "isPartOf",
            "label": "detail belongs to area",
            "createdAt": "2026-03-11T10:00:00.000Z",
            "createdBy": "user-id-1",
            "updatedAt": "2026-03-11T10:00:00.000Z",
            "updatedBy": "user-id-1"
        }
    ]
}
```

### Conceptual model

- nodes are annotations
- edges are semantic or workflow relationships between annotations

### Possible relation types

- `isPartOf`
- `isDerivedFrom`
- `correspondsTo`
- `isSimilarTo`
- `nextInSequence`

### Notes

- this model is extensible and avoids redundant bidirectional pointers
- it supports hierarchical, sequential, and cross-reference relations in a uniform way
- if a future UI needs explicit tree navigation, it can derive it from relation types such as `isPartOf`

This is not strictly necessary for the first version, but it may become useful for more complex annotation scenarios.

---
