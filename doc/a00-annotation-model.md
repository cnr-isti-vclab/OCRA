# OCRA Annotation Model

## Introduction

This document defines the annotation data model for OCRA. It describes the core entities, their fields, lifecycle semantics, and the invariants that keep annotations consistent across projects, scenes, and digital assets.

OCRA adopts a **decomposed, relational annotation model** in which spatial anchors, semantic content, and their associations are represented as independent, first-class entities. This design enables flexible reuse: a single geometry anchor may be associated with multiple semantic interpretations, and a single semantic record may apply to multiple spatial positions across different scenes or assets.

The model is split into three first-class entities:

- `annotationGeometry` — the 3D geometric anchor, expressed in the reference space of a scene or a digital asset
- `annotationData` — the semantic content record, scoped to a scene or a digital asset
- `annotationLink` — an explicit, auditable association between one geometry element and one data record

`annotationGeometry` and `annotationData` are **independent resources**. Their relationship is defined exclusively through `annotationLink`. Neither entity needs to know about the other to exist.

This separation allows OCRA to represent annotations as composable, reusable structures rather than as monolithic records.

## Design Principles

The annotation model follows these principles:

- **Independence**: geometry and semantic content are stored and managed independently. Either can exist without the other.
- **Explicit associations**: relationships between geometry and data are first-class entities that can be individually created, queried, soft-removed, and restored.
- **Immutable scope**: spatial and semantic scopes are fixed at creation time and cannot be changed in place.
- **Erasability over deletion**: the lifecycle model normally uses a `non-erasable` / `erasable` state transition rather than immediate physical removal, preserving audit trails and enabling safe collaborative editing.
- **Stateless concurrency**: visibility and consistency are determined at read time from the stored state, not from server-held locks or sessions.

## Entity Overview

| Entity | Role |
| --- | --- |
| `annotationGeometry` | Standalone 3D geometric shapes relative to a scene or an asset |
| `annotationData` | Standalone semantic content relative to a scene or an asset |
| `annotationLink` | Join entity associating one geometry element with one data record |

All three entities may be in either `non-erasable` or `erasable` state. At the model level, an `annotationGeometry` or `annotationData` entity remains visible if at least one incoming non-erasable `annotationLink` still points to it, or if the entity itself is still `non-erasable`. An `erasable` entity disappears from normal reads only after the last incoming non-erasable link is removed.

Each mutable collection maintains a per-document `version` field used as the optimistic concurrency token. `createdAt`, `updatedAt`, and `updatedBy` are assigned server-side for auditability and debugging.

![Diagram illustrating the annotation data model and relationships](media/annotation-model.svg)

## Scope and Visibility Model

Annotations are always scoped to a project and then positioned relative to a scene or an asset.

- `annotationGeometry` uses `referenceType` and `referenceId` to identify the coordinate space in which the anchor lives.
- `annotationData` uses `visibilityType` and `visibilityId` to identify the context in which the semantic content is visible.
- `annotationLink` may connect geometry and data only when their scopes are compatible (see [scene consistency rules](#scene-consistency-rules) below).

All three entities include `projectId`, enabling project-level isolation and indexing across MongoDB collections.

## Model-Level Design Rationale

The separation between geometry, data, and link provides several operational benefits:

- The same semantic record may be reused across multiple geometry anchors (e.g. the same damage classification applied to several spatial regions).
- The same geometry may carry multiple semantic interpretations (e.g. different annotation perspectives from different scholars).
- Geometry and data can evolve independently: adjusting the spatial position of an anchor does not affect the semantic content, and vice versa.
- Collaboration conflicts are reduced because many concurrent edits touch different documents in different collections.
- Deletion is safe and reversible: marking entities and links as `erasable` never leaves the system in an inconsistent state and enables an `undelete` flow.

### Notes on Scenes and Assets

- A **digital asset** has its own unique identifier and its own 3D reference space. It provides a digital representation of a physical object (2D or 3D) and exposes methods for rendering and spatial selection.
- A **scene** has its own unique identifier and its own reference space. It aggregates a set of digital assets, each positioned within that scene's coordinate system.
- The same digital asset may appear in multiple scenes at different positions.

### Immutability of Scope Fields

The fields that define the spatial and visibility scope of an entity are **immutable after creation**:

- `annotationGeometry.referenceType` and `annotationGeometry.referenceId`
- `annotationData.visibilityType` and `annotationData.visibilityId`

If an annotation must be moved to a different scene or asset, the correct approach is to create new entities and update the links accordingly. In-place reassignment of scope is intentionally not supported, as it would silently break the scene consistency invariant for existing links.

## Scene Consistency Rules

The validity of an `annotationLink` depends on the compatibility between geometry scope and data visibility. The following four combinations are permitted:

| Geometry `referenceType` | Data `visibilityType` | Consistency constraint | Resulting visibility |
| --- | --- | --- | --- |
| `"scene"` | `"scene"` |`annotationGeometry.referenceId == annotationData.visibilityId` | Single scene |
| `"scene"` | `"asset"` | Geometry's scene contains the data's asset | Single scene, single asset |
| `"asset"` | `"scene"` | Geometry's asset is contained in the data's scene | Single scene, single asset |
| `"asset"` | `"asset"` | `annotationGeometry.referenceId == annotationData.visibilityId` | All scenes containing the asset |

Any link whose geometry–data pair does not satisfy one of these consistency constraints must be rejected at creation time.

## annotationGeometry

### Purpose

`annotationGeometry` defines the 3D anchor of an annotation. It stores one or more shapes and binds them to either a scene or an asset reference frame. It is the spatial anchor of an annotation and may exist independently of any semantic content.

### Shape Types

A shape defines a 3D geometric primitive. Each shape object declares a `type` and carries type-specific vertex data. All coordinates are expressed in the reference space identified by `referenceType`/`referenceId`.

| Shape type | Description | Required field | Minimum vertices |
| --- | --- | --- | --- |
| `ShapePoints` | A set of 3D sample points | `vertices: [x,y,z][]` | 1 |
| `ShapePolyline` | A sequence of connected 3D line segments | `vertices: [x,y,z][]` | 2 |
| `ShapePolygon` | A closed planar area (closure is implicit) | `vertices: [x,y,z][]` | 3 |

Differrent shapes from the above list may be added in the future. The `type` field allows for extensibility while maintaining a consistent structure.

A single `annotationGeometry` may contain one or more shapes of any combination of types. The simple case is a single-element `shapes` array. Heterogeneous groups (e.g. a `ShapePoints` alongside a `ShapePolygon`) are expressed by including multiple shape objects in the array.

Grouping different shapes within the same geometry allows for flexible representation of complex spatial anchors. For example, a `ShapePolygon` may define the main area of interest, while a `ShapePoints` may mark specific features within that area.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier. Immutable. |
| `projectId` | `string` | Identifier of the project this geometry belongs to. |
| `shapes` | `Shape[]` | Non-empty array of 3D geometric primitives defining the annotation anchor. |
| `referenceType` | `"scene"` \| `"asset"` | Coordinate space and visibility scope. **Immutable after creation.** |
| `referenceId` | `string` | Identifier of the target `HDTScene` or `DigitalAsset`. **Immutable after creation.** |
| `version` | `integer` | Monotonic document version for optimistic concurrency. Incremented atomically on each update. |
| `erasableAt` | `ISO 8601 timestamp \| null` | Timestamp at which the entity was marked as erasable; `null` if non-erasable. |
| `erasableBy` | `user id \| null` | User who marked the entity as erasable; `null` if non-erasable. |
| `createdAt` | `ISO 8601 timestamp` | Server-assigned creation timestamp. Immutable. |
| `createdBy` | `user id` | User who created the entity. Immutable. |
| `updatedAt` | `ISO 8601 timestamp` | Server-assigned last-modification timestamp for audit and debugging. |
| `updatedBy` | `user id` | User who last modified the entity, for audit and debugging. |

### Invariants

- `projectId` must identify an existing project.
- `shapes` must be a non-empty array of valid shapes.
- `referenceType` must be either `"scene"` or `"asset"`.
- `referenceId` must identify an existing scene or asset compatible with `referenceType` at the time of creation.
- `referenceType` and `referenceId` are immutable after creation.

### Lifecycle Semantics

`annotationGeometry` follows this lifecycle:

- it starts as `non-erasable`
- it may later be marked as `erasable`
- it remains visible while at least one non-erasable `annotationLink` still references it
- once it is `erasable` and unreferenced, it disappears from normal reads

Marking an entity as `erasable` communicates a soft-removal intent without irreversible side effects, and the entity can be restored to `non-erasable` at any time before physical cleanup. 
Frontend read operations can include `erasable` entities in their results, allowing editors to inspect, display with a distinct visual style, or restore them as needed.

### JSON Example

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
        [0.43, 0.32, 0.12]
      ]
    }
  ],
  "referenceType": "scene",
  "referenceId": "scene_id_main",
  "version": 0,
  "erasableAt": null,
  "erasableBy": null,
  "createdAt": "2026-03-11T10:00:00.000Z",
  "createdBy": "user-id-1",
  "updatedAt": "2026-03-11T10:00:00.000Z",
  "updatedBy": "user-id-1"
}
```

## annotationData

### Purpose

`annotationData` defines the semantic content of an annotation independently from its spatial anchor. It stores a label, description, optional classification, arbitrary ontology-defined payload, and a visibility scope. It may exist independently of any geometry.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier. Immutable. |
| `projectId` | `string` | Identifier of the project this data belongs to. |
| `label` | `string` | Short, non-empty label or title. Suitable for lists, legends, and quick-selection tools. |
| `description` | `string` | Free-text description, notes, or scholarly references. May be empty. |
| `class` | `string \| null` | Optional classification tag (e.g. `"damage"`, `"restoration"`, `"material"`, `"diagnostic"`). A controlled vocabulary may be enforced at application level. |
| `content` | `object` | Open payload conforming to an ontology-defined structure. Semantics are defined externally. |
| `visibilityType` | `"scene"` \| `"asset"` | Determines whether this record is scoped to a scene or a digital asset. **Immutable after creation.** |
| `visibilityId` | `string` | Identifier of the target `HDTScene` or `DigitalAsset`. **Immutable after creation.** |
| `version` | `integer` | Monotonic document version for optimistic concurrency. Incremented atomically on each update. |
| `erasableAt` | `ISO 8601 timestamp \| null` | Timestamp at which the entity was marked as erasable; `null` if non-erasable. |
| `erasableBy` | `user id \| null` | User who marked the entity as erasable; `null` if non-erasable. |
| `createdAt` | `ISO 8601 timestamp` | Server-assigned creation timestamp. Immutable. |
| `createdBy` | `user id` | User who created the entity. Immutable. |
| `updatedAt` | `ISO 8601 timestamp` | Server-assigned last-modification timestamp for audit and debugging. |
| `updatedBy` | `user id` | User who last modified the entity, for audit and debugging. |

### Invariants

- `projectId` must identify an existing project.
- `label` must be a non-empty string.
- `visibilityType` must be either `"scene"` or `"asset"`.
- `visibilityId` must identify an existing scene or asset compatible with `visibilityType` at the time of creation.
- `visibilityType` and `visibilityId` are immutable after creation.

### Lifecycle Semantics

`annotationData` follows the same lifecycle model as `annotationGeometry`:

- it starts as `non-erasable`
- it may later be marked as `erasable`
- it remains visible while at least one non-erasable `annotationLink` still references it
- once it is both `erasable` and unreferenced, it disappears from normal reads

Marking an entity as `erasable` communicates a soft-removal intent without irreversible side effects, and the entity can be restored to `non-erasable` at any time before physical cleanup. 
Frontend read operations can include `erasable` entities in their results, allowing editors to inspect, display with a distinct visual style, or restore them as needed.

### JSON Example

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
  "erasableAt": null,
  "erasableBy": null,
  "createdAt": "2026-03-11T10:00:00.000Z",
  "createdBy": "user-id-1",
  "updatedAt": "2026-03-11T10:00:00.000Z",
  "updatedBy": "user-id-1"
}
```

## annotationLink

### Purpose

`annotationLink` is a first-class join entity connecting exactly one geometry element and exactly one data record. It carries no semantic content of its own. Its responsibility is to make the geometry–data association explicit, auditable, independently manageable, and reversible for undo/undelete scenarios.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier. Immutable. |
| `projectId` | `string` | Identifier of the project this link belongs to. |
| `geometryId` | `string` | Identifier of the referenced `annotationGeometry`. Immutable after creation. |
| `dataId` | `string` | Identifier of the referenced `annotationData`. Immutable after creation. |
| `version` | `integer` | Monotonic document version for optimistic concurrency. Incremented atomically on each erasable-state transition. |
| `erasableAt` | `ISO 8601 timestamp \| null` | Timestamp at which the link was marked as erasable; `null` if non-erasable. |
| `erasableBy` | `user id \| null` | User who marked the link as erasable; `null` if non-erasable. |
| `createdAt` | `ISO 8601 timestamp` | Server-assigned creation timestamp. Immutable. |
| `createdBy` | `user id` | User who created the link. Immutable. |
| `updatedAt` | `ISO 8601 timestamp` | Server-assigned last-modification timestamp for audit and debugging. |
| `updatedBy` | `user id` | User who last modified the link, for audit and debugging. |

### Invariants

1. `projectId` must identify an existing project.
2. `geometryId` must reference an existing geometry record in the same project.
3. `dataId` must reference an existing data record in the same project.
4. The pair (`geometryId`, `dataId`) must be unique within the project.
5. The geometry scope and data visibility must satisfy the [scene consistency rules](#scene-consistency-rules).

### Mutability Rules

`annotationLink` is **structurally immutable after creation**. No update operation is defined for its endpoints.

To change an association, the existing link must be marked as `erasable` and a new link must be created. The only allowed in-place state transitions are between `non-erasable` and `erasable`, which require a `version` field for optimistic concurrency.

### Lifecycle Semantics

`annotationLink` follows the same erasability model as the other first-class annotation entities:

- it starts as `non-erasable`
- it may later be marked as `erasable`
- when it becomes `erasable`, the referenced `annotationGeometry` and `annotationData` remain unchanged
- while it is `erasable`, it is excluded from normal reads and no longer contributes to the reachability of its referenced `annotationGeometry` and `annotationData`
- it may later be restored to `non-erasable` to implement an `undelete`

Marking an `annotationLink` as `erasable` affects only the link itself: it does not change the erasable state of the referenced `annotationGeometry` or `annotationData`.

Restoring an `annotationLink` to `non-erasable` restores only the link itself. The operation succeeds only if the referenced `annotationGeometry` and `annotationData` still exist and are already both `non-erasable`.

The endpoints of a link remain immutable: restoration never rewrites `annotationGeometry` or `annotationData` references, and in the current implementation it does not change endpoint erasability either.

### Cascade Rules for Erasability

The current implementation applies the following cascade rules:

- If an `annotationGeometry` is marked as `erasable`, all currently non-erasable `annotationLink` records connected to that geometry are marked as `erasable` in the same MongoDB transaction.
- If an `annotationData` record is marked as `erasable`, all currently non-erasable `annotationLink` records connected to that data record are marked as `erasable` in the same MongoDB transaction.
- If an `annotationGeometry` is restored to `non-erasable`, a connected link is restored to `non-erasable` only if the linked `annotationData` is already non-erasable.
- If an `annotationData` record is restored to `non-erasable`, a connected link is restored to `non-erasable` only if the linked `annotationGeometry` is already non-erasable.

In other words, a link may be non-erasable only when both of its endpoints are non-erasable. Direct link restore does not restore endpoints.

### JSON Example

```json
{
  "id": "link_ghi789",
  "projectId": "proj_xyz987",
  "geometryId": "geom_abc123",
  "dataId": "data_def456",
  "version": 0,
  "erasableAt": null,
  "erasableBy": null,
  "createdAt": "2026-03-11T10:00:00.000Z",
  "createdBy": "user-id-1",
  "updatedAt": "2026-03-11T10:00:00.000Z",
  "updatedBy": "user-id-1"
}
```

## Visibility Semantics

Annotation visibility in OCRA is not a simple property of a single record. It emerges from the combination of:

- the entity's **erasable state** (`non-erasable` or `erasable`)
- the entity's **link reachability** (whether any non-erasable `annotationLink` still points to it)
- the **scope** (`referenceType`/`referenceId` or `visibilityType`/`visibilityId`)

The table below summarises how erasability and link reachability together determine whether an entity appears in normal (non-editor) reads:

| Erasable state | Incoming non-erasable links | Visible in normal reads? |
| --- | --- | --- |
| `non-erasable` | Any (including zero) | Yes |
| `erasable` | At least one | Yes |
| `erasable` | Zero | No |

**Two important consequences:**

1. An entity marked as `erasable` is not necessarily invisible immediately — it remains visible as long as at least one non-erasable link still points to it.
2. An entity with zero incoming links is not necessarily invisible — if it is `non-erasable`, it remains available as a standalone annotation resource.

An `erasable` entity with zero incoming links is therefore in a transient state: it is already excluded from normal reads, but it may still exist physically in the database until a maintenance or garbage-collection routine removes it. After that physical removal, it disappears completely from all model-level visibility.

`annotationLink` itself follows the same inclusion rule: a link marked as `erasable` is excluded from normal reads and is ignored when evaluating the reachability of `annotationGeometry` and `annotationData`. Marking the link as `erasable` leaves the referenced entities unchanged. If that link is later restored, only the link becomes `non-erasable` again, and only if both endpoints are already non-erasable.

For visibility purposes, only non-erasable links count toward reachability. Having only incoming `annotationLink` records that are themselves `erasable` is equivalent to having zero incoming links.

This lifecycle rule applies to ordinary annotation editing. Project-structuring operations are an explicit exception: if a scene, asset, or project is structurally deleted, any annotation records whose scope depends on that deleted context must be physically removed as part of the same structural cleanup, because they no longer have a valid meaning in the model.

Frontend read operations may opt in to include `erasable` entities via an `includeErasable` flag, so that editors can inspect, display with a distinct visual style, or restore them.

## Versioning and Audit Fields

For mutable entities (`annotationGeometry`, `annotationData`, and `annotationLink`), the model guarantees:

- `version` is initialised to zero during creation.
- `version` is incremented as part of every successful update in the same atomic write and is the only token used by the OCC check.
- `updatedAt` and `updatedBy` are written atomically with the version increment, but they are retained only for audit and debugging.
- `createdAt` and `createdBy` are immutable after creation.
- `erasableAt` and `erasableBy` are set atomically when an entity is marked as `erasable`, and cleared atomically when it is restored to `non-erasable`. Both transitions also increment `version` and update `updatedAt`/`updatedBy`.
- All timestamps are server-assigned to guarantee a coherent time source across clients.

For `annotationLink`, the only allowed updates are those erasable-state transitions. Its `geometryId` and `dataId` values never change after creation.

Geometry and data restore operations use transactions because they may update both the endpoint document and a set of connected links. Link restore also uses a transaction, but in the current implementation the transaction is used to verify endpoint state and restore the link atomically with those checks; it does not update geometry or data.

This design supports optimistic concurrency control (OCC) without long-lived database locks. The conditional MongoDB update filter uses `version`, not `updatedAt`, as the concurrency token. This avoids coupling correctness to timestamp precision, clock skew, or clock-dependent ordering.
