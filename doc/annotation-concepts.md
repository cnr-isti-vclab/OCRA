# Annotations in 3D Models

## Overview

An annotation is a persistent entity stored in the HDT document.
Within OCRA, an annotation always belongs to exactly one scene, which is its viewing and editing context.
Its purpose is to connect semantic information to a geometric entity defined in 3D space.

In the current model, an annotation is composed of three main parts:

- `annotationGeometry`: the geometric definition of the annotated entity in 3D space
- `annotationData`: the minimal semantic content shown to users
- `annotationParadata`: provenance and workflow metadata about how the annotation was created or modified

An annotation may semantically target:

- an `HDTScene`
- a `DigitalAsset`

This is expressed by the pair:

- `referenceType`
- `targetId`

This semantic target is distinct from scene membership.
In other words:

- `sceneId` identifies the scene in which the annotation exists
- `referenceType` and `targetId` identify what the annotation refers to within that scene

As a consequence, annotations are not shared directly across scenes.
If the same conceptual annotation must appear in multiple scenes, it should normally be duplicated as a scene-local annotation, optionally linked to the others through an annotation relation such as `isDerivedFrom` or `correspondsTo`.

---

## Basic Concepts

Two main concepts are involved:

- **Georeferences**: 3D entities geometrically defined within the model space
- **Annotations**: semantic descriptions associated with one or more georeferences

In practice, an annotation is a semantic description of a geometric entity defined on a 3D model or within a 3D scene.

---

## `Annotation` (inside HDT document)

### Core fields

- `id`  
    Unique annotation identifier within the HDT document.

- `referenceType`  
    Indicates the type of semantic target entity:
    - `'scene'`
    - `'asset'`

- `targetId`  
    Identifier of the semantic target entity:
    - `HDTScene.id` if `referenceType = 'scene'`
    - `DigitalAsset.id` if `referenceType = 'asset'`

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
    "sceneId": "scene_3d_main",
    "referenceType": "scene",
    "targetId": "scene_3d_main",
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

- creation method (`manual`, `imported`, `derived`)
- software tool used
- editing notes
- confidence or quality notes
- workflow state information

This field is intentionally free-form in the current version.

---

## Annotation lifecycle and audit rules

All write operations on annotations must update timestamps and authorship consistently.

### Scene-local ownership rule

Each annotation belongs to exactly one scene.

- annotations are created inside a specific scene
- annotations are retrieved primarily through their scene
- annotations targeting assets are still scene-local annotations
- if similar annotations are needed in multiple scenes, they should be duplicated rather than shared by reference across scenes

This keeps scene state self-contained and avoids ambiguity when geometry, visibility, transforms, or interpretation differ across scenes.

### On create

The system must:

- generate a new `annotation.id`
- set `createdAt`
- set `createdBy`
- set `updatedAt`
- set `updatedBy`

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

- remove the annotation from the annotation store
- remove any dependent reference to `annotation.id` if such references are maintained elsewhere in the HDT document

---

## Annotation operations

The annotation store should support the following operations.

Within OCRA, the scene is the main retrieval context for annotations shown in the viewer.
For this reason, `getAnnotations(HDTScene.id)` should be understood as:

- return all annotations that belong to the scene composition
- regardless of whether each annotation targets the scene itself or one of the assets included in that scene

In practice, this is consistent with a model where each annotation has a `sceneId` and a scene may also maintain an explicit list of associated annotation ids, while each annotation still keeps its own semantic target through `referenceType` and `targetId`.

### Write operations

- `create(annotation)`  
    Creates a new annotation and assigns `id`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`.

- `update(annotation.id, patch)`  
    Updates one or more mutable fields of the annotation.

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

### Read operations

- `getAnnotation(annotation.id)`  
    Returns a single annotation by identifier.

- `getAnnotations(HDTScene.id)`  
    Returns all annotations that compose a given scene, including annotations targeting the scene itself and annotations targeting assets used in that scene.

### Utility operations

- `getClass(annotation.id)`  
    Returns `annotationClass`.

- `getLabel(annotation.id)`  
    Returns `annotationData.label`.

- `getDescription(annotation.id)`  
    Returns `annotationData.description`.

---

## Query and indexing considerations

Since annotations are expected to be queried primarily by scene composition and by identifier, the implementation should support efficient retrieval by:

- `id`
- `sceneId`
- scene membership / scene annotation association
- `targetId`
- `referenceType`
- optionally `annotationClass`

Typical access patterns include:

- retrieving a single annotation by `id`
- retrieving all annotations belonging to a given scene
- resolving scene annotations even when individual annotations target different assets inside that scene
- duplicating or relating scene-local annotations that represent the same conceptual mark across different scenes
- retrieving all annotations of a given class within a target entity

---

## `AnnotationGraph` (inside HDT document)

`AnnotationGraph` can be introduced later to represent explicit relationships between annotations.

For OCRA, a flexible and non-redundant approach is to treat:

- each `Annotation` as a graph node
- each relation between annotations as an explicit typed edge

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
