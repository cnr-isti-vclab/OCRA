# Collaborative Annotation Editing in OCRA

## Introduction

OCRA is a multi-user platform for 2D/3D annotation and digital documentation of cultural heritage objects. Multiple scholars — restorers, archaeologists, art historians, or project managers — may access the same project simultaneously, viewing scenes and contributing or refining annotations.

This document defines the concurrency model and collaborative editing strategy for annotations in OCRA. It covers:

- The distinction between **structuring** and **editing** operations and their different concurrency requirements.
- The **optimistic concurrency control** (OCC) strategy adopted for annotation editing, including conflict detection and resolution.
- The **Social Lock** mechanism used to reduce conflict probability while preserving architectural simplicity.
- The **real-time synchronisation** layer that keeps concurrent clients aware of remote changes.

The OCC, Social Lock, and annotation mutation broadcast-network rules described here match the current implementation. Read-session coordination for structuring remains documented separately.

The dedicated design for project-wide exclusive structuring lock, persistent presence tracking, and future structuring APIs is documented separately in [Structuring Lock and Project Presence](./a04-structuring-lock.md).

Real-time synchronisation is informational only, not a locking mechanism. It can be used to notify users and to let passive viewers explicitly refresh changed annotations, but it does not enforce consistency. It uses the same Broadcast Network channel as the Social Lock, while remaining a separate concept.

For annotation editing, the model is intentionally stateless: there are no long-lived database locks, no server-side session ownership of records, and no heartbeat infrastructure. Consistency is guaranteed at commit time through atomic conditional writes. This does not apply to structuring operations, which follow a different concurrency model.

---

## Operation Categories

OCRA distinguishes two fundamentally different categories of operations, each with its own concurrency model.

### Structuring Operations

**Required role**: `manager` (or `sys_admin`). The `editor` role cannot perform structuring operations.

Structuring operations modify the project's organizational structure: creating or deleting scenes, adding or removing digital assets from scenes, repositioning assets, and publishing HDT data. These operations can change the reference spaces and containment relationships on which annotation geometry and data depend.

In the adopted design, project-wide structuring coordination is handled by a persistent exclusive lock plus project presence leases. The detailed model, state machine, invariants, and minimal API surface are documented in [Structuring Lock and Project Presence](./a04-structuring-lock.md).

Because structuring operations may invalidate annotations (e.g. deleting a scene that annotations reference), they require **exclusive access**: no other user may read or edit the project while a structuring operation is in progress.

**Concurrency Rule 1 — Exclusive structuring lock**: when a structuring operation is in progress, all other operations (read, view, edit) are blocked until the structuring operation completes.

### Annotation Editing Operations

**Required role**: `editor` or above (`editor`, `manager`, or `sys_admin`). The `editor` role is the primary annotation role. Editors can create, update, and change the erasable state of annotations, but cannot perform any structuring operation.

Annotation editing operations act on `annotationGeometry`, `annotationData`, and `annotationLink` records. `annotationGeometry` and `annotationData` may be created, updated, or transitioned between `non-erasable` and `erasable`. `annotationLink` keeps its two endpoints (`geometryId` and `dataId`) immutable after creation, but it also participates in the same `non-erasable` / `erasable` lifecycle and OCC model. 

Annotation editing uses **optimistic concurrency control**: multiple users may work on the same scene's annotations simultaneously. Conflicts are detected only at save time, not preventively locked up front.

### Scene Viewing

Viewing is the act of loading a scene and exploring its current annotations without modifying anything.

**Concurrency Rule 2 — Unrestricted viewing**: any user may view any scene at any time, as long as no structuring operation is in progress. Concurrent edits by other users do not block viewing. A loaded scene starts as a snapshot of the saved state at load time; later remote changes are not applied automatically, but the viewer may explicitly refresh the changed annotations when notified.

---

## Why Optimistic Concurrency for Annotations?

The OCRA annotation use case has characteristics that make optimistic concurrency clearly superior to pessimistic locking:

| Characteristic | Value |
| --- | --- |
| Typical simultaneous editors per scene | 2–3 |
| Probability that two editors touch the same annotation | Low |
| Typical annotation editing duration | 1–10 minutes |

A **pessimistic lock on an entire scene or asset** would block all other annotation work in that scene for up to 10 minutes whenever any user is editing. This is unacceptably disruptive for a collaborative scholarly platform.

A **pessimistic lock on individual annotation records** would require a heartbeat infrastructure to recover from browser crashes and disconnections mid-edit, adding significant complexity and going against the simplicity requirement.

The **optimistic approach** shines in this scenario: it imposes zero blocking cost in the common case (no conflict) and handles the rare conflict at commit time, at most requiring the second editor to decide whether to retry or merge.

---

## Optimistic Concurrency Control

### How It Works

Every mutable annotation entity (`annotationGeometry`, `annotationData`, and `annotationLink`) carries a `version` integer and an `updatedAt` server-assigned timestamp. All three entity types support OCC-protected writes; the specific operations differ by type (see [Scope of the OCC Check](#scope-of-the-occ-check) below). The OCC check works as follows:

1. **Read**: the client loads the entity and records its current `version` value as `expectedVersion`.
2. **Edit**: the user modifies the entity locally. No lock is acquired.
3. **Save**: the client sends the update to the backend, including `expectedVersion`.
4. **Conditional write**: the backend performs a MongoDB update with the filter `{ id: entityId, version: expectedVersion }`. If the document has been modified in the meantime (i.e. `version` no longer matches), the update finds no document and is rejected.
5. **Success path**: if the write succeeds, the backend returns the new `version`. The client stores this as the new `expectedVersion` for the next save.
6. **Conflict path**: if the write fails because `expectedVersion` is stale and no longer matches the current `version`, the client is notified and must decide how to proceed (see [Conflict Resolution](#conflict-resolution) below).

The `version` integer is updated atomically in the same write operation as the modified fields. `updatedAt` remains server-assigned and is retained for audit and debugging.

### Scope of the OCC Check

The OCC check applies to all mutating operations on `annotationGeometry`, `annotationData`, and `annotationLink`. The allowed operations differ by entity type:

**`annotationGeometry` and `annotationData`**:
- `update` — modify the entity's content fields (shapes, label, description, class, content, …)
- `markErasable` — transition to `erasable` state (writes `erasableAt` / `erasableBy`)
- `markNonErasable` — restore to `non-erasable` state (clears `erasableAt` / `erasableBy`)

**`annotationLink`**:
- `markErasable` — transition to `erasable` state (writes `erasableAt` / `erasableBy`)
- `markNonErasable` — restore to `non-erasable` state (clears `erasableAt` / `erasableBy`)

`annotationLink` does support update operations — specifically the two erasable-state transitions above, which are full OCC-protected writes that increment `version` and set `updatedAt`/`updatedBy`. What is immutable on a link after creation is its structural identity: the `geometryId` and `dataId` endpoints. To change an association, the existing link must be marked as `erasable` and a new link must be created.

Physical deletion of `annotationGeometry` and `annotationData` is **never triggered by a user action** through the annotation API. It is performed exclusively by garbage collection routines or superuser maintenance operations, both of which operate outside the normal editing workflow.

Physical deletion of `annotationLink` is likewise **not part of the normal editing workflow**. Ordinary link removal is expressed by marking the link as `erasable`, leaving its referenced `annotationGeometry` and `annotationData` unchanged. Restoring a link to `non-erasable` is an OCC-protected write and changes only the link itself.

In the adopted model, `erasable` and `non-erasable` should be read semantically as `weak` and `strong`:

- `non-erasable` means `strong / not collectible`
- `erasable` means `weak / collectible if not kept alive`
- a non-erasable `annotationLink` is itself a strong relationship and keeps its referenced geometry and data alive for maintenance purposes

All flag combinations are therefore valid in the database. The backend does not rely on automatic cascades between collections to enforce a stronger semantic invariant.

No operation type has automatic priority over the others. A stale `markErasable` request fails in the same way as a stale `update` request.

The OCC check also captures the entity's erasability state as part of the validation. This means that if Entity A was `non-erasable` when User 1 began editing and is `erasable` when User 1 attempts to save, the save is rejected — the `version` will have changed when the erasable state was set. The client learns about the state change and can decide the next step.

### Creation

Creation operations have no concurrency conflict: new records have globally unique identifiers generated at save time. A user can work locally for any amount of time building a new annotation without risking a conflict with other users. The insert either succeeds (if the id does not yet exist) or fails cleanly (if a duplicate id is detected, which in practice cannot happen with properly generated IDs). This applies equally to newly created `annotationGeometry`, `annotationData`, and `annotationLink` records.

### Conflict Resolution

When a conditional write is rejected because the entity has been modified in the meantime, the backend returns an error indicating that the client's `expectedVersion` is stale. The recommended client-side behaviour is:

1. **Notify the user**: display a clear message — e.g. *"This annotation has been modified by another user since you began editing."*
2. **Present options**:
   - **Reload and discard**: fetch the current state from the server, discard the local draft, and show the updated annotation.
   - **Proceed with the current version**: let the user review their change against the latest saved state and explicitly re-submit, issuing a new intentional operation against the new `expectedVersion`.
3. **Do not silently overwrite**: blindly replaying a stale operation is not permitted. The user must make an explicit decision.

In the specific case where the target entity has become `erasable` in the meantime, the UI should additionally ask whether the user wants to restore it to `non-erasable` before continuing. The frontend is also responsible for explaining whether the entity is weak but still retained by a strong link, or weak and eligible for cleanup.

### Weak/Strong Operational Semantics

The adopted annotation model uses the following operational rules:

1. All combinations of `erasable` / `non-erasable` across geometry, data, and link are valid in the database.
2. `non-erasable` means `strong / not collectible`; `erasable` means `weak / collectible if not kept alive`.
3. A non-erasable `annotationLink` keeps its referenced geometry and data alive for maintenance purposes.
4. Primitive state transitions on geometry, data, and link act only on the targeted document. They do not cascade automatically.
5. Composite user intentions such as "delete annotation", "restore annotation", "make this cluster weak", or "recover from trash" are higher-level operations and may be implemented later as dedicated APIs and guided UX flows.
6. Cleanup of weak entities and links is not ordinary editing; it belongs to maintenance/structuring because it can physically remove persisted records.

---

## Social Lock

The OCC mechanism guarantees correctness but does not reduce the probability of conflict. To address this, OCRA supports a lightweight **Social Lock** layer that warns editors of parallel activity before a conflict occurs.

### What It Is and What It Is Not

The Social Lock is a **purely informational indicator**. It does not block saves, does not hold database records, and does not prevent concurrent edits. It is a best-effort notification mechanism.

The Social Lock uses two explicit kinds:

- `presence`: session-level activity in a scene/asset scope
- `editor`: editing intent on one concrete annotation resource (`geometry`, `data`, or `link`)

The backend does not enforce access control based on Social Lock state. The annotation model works correctly even if Social Lock messages are delayed, lost, or never sent.

### How It Works

1. When a client enters a scene/asset context, it may send a `presence` lock (scope-level awareness).
2. When a user starts editing one concrete annotation resource, the client sends an `editor` lock for that `resourceType/resourceId`.
3. Other clients whose current scene is affected by the event `impact` receive the notification and display a visual cue.
4. A second editor, seeing the cue, can choose to work on a different annotation to avoid a potential conflict.
5. When editing ends (save/cancel/close), the client sends a stop notification. If the stream closes unexpectedly, backend stream cleanup removes that stream's active social locks.

The Social Lock does **not** prevent the second editor from continuing. If the second editor proceeds, the standard OCC check at save time will handle the conflict correctly.

---

## Real-Time Synchronisation

Beyond Social Locks, OCRA provides mechanisms to keep all connected clients aware of committed changes in the scene. This reduces the chance of users unknowingly working on stale data.

### Notification Channels

The backend emits mutation events whenever a create, update, or erasability-state change is committed successfully. This includes `annotationLink` transitions to `erasable` and back to `non-erasable`. These events are delivered via **Server-Sent Events (SSE)**: a standard HTTP mechanism in which the server keeps a response stream open and pushes lightweight text events to the client as they occur. SSE is unidirectional (server → client), requires no special protocol beyond HTTP, and is natively supported by all modern browsers.

> **Note:** the SSE endpoint must be served with `Cache-Control: no-cache` and must not be intercepted by any HTTP cache or reverse-proxy buffer. Caching the response stream would prevent events from reaching the client in real time.

### Client Behaviour on Receiving Updates

When a client receives a notification that annotation data in the current scene has changed, the recommended behaviour depends on the user's current mode:

**Viewing mode (passive viewer):**
The user receives a non-intrusive notification — e.g. *"An annotation has been updated by another user."* — with an option to refresh the scene or the specific annotation. If the user accepts the notification, the frontend fetches the updated annotation and re-renders it in the background. If the user ignores the notification, the scene remains on its previous snapshot and some annotations may stay stale until the user explicitly refreshes or reloads.

**Editing mode (active editor):**
If the notification concerns an annotation that the user is actively editing, the frontend should immediately surface a non-blocking warning — e.g. *"The annotation you are editing has just been modified by another user."* The user can then:

- **Reload and discard**: fetch the current state from the server, discard the local draft, and show the updated annotation.
- **Proceed with the current version**: let the user review their change against the latest saved state and explicitly re-submit, issuing a new intentional operation against the new `expectedVersion`.

### Relationship to Social Locks

The synchronisation notification and the Social Lock use the same Broadcast Network channel. They serve complementary purposes:

- **Social Lock** warns about *intent to edit* (before a change is committed).
- **Synchronisation notification** informs about *committed changes* (after a change is saved).

Neither is required for the model to remain consistent. Both are optional quality-of-experience improvements.

---

## The Architecture of Independent Entities

The decomposed annotation model — separate collections for `annotationGeometry`, `annotationData`, and `annotationLink` — has a direct positive effect on collaborative editing:

If User A is adjusting the spatial anchor (`annotationGeometry`) of an annotation while User B is fixing a typo in the label (`annotationData`) of the same annotation, these are two different documents in two different collections. Both saves will succeed without any conflict. The `annotationLink` continues to connect the new geometry to the updated data.

Conflicts only arise when two users attempt to modify the **same document** at the **same time** — including the same `annotationLink` erasability transition — a genuinely rare event given the typical team size and editing duration.

---

## Workflow Summaries

### Workflow 1: Scene Structuring (Exclusive Lock)

**Actors**: Admin, Creator, Project Manager  
**Operations**: Create/delete scenes, add/remove assets, reposition assets, publish HDT data.

1. The initiating user requests the exclusive structuring lock via `startStructuring(projectId)`.
2. The system verifies that no other session is active (no reads, edits, or other structuring operations).
3. If granted, all other operations are blocked until `stopStructuring(projectId)` is called.
4. The structuring operation is performed, including any maintenance or structural cleanup that physically removes project content. For example, deleting an asset must still remove annotation records whose scope depends on that asset, because they no longer have a valid reference space.
5. The lock is released. Normal operations may resume.

### Workflow 2: Annotation Editing (Optimistic)

**Actors**: Editor or any user with higher privileges  
**Precondition**: No structuring operation is in progress.

1. The user loads the scene. Active annotations are fetched, including `version` for each mutable entity. `updatedAt` is returned for audit and debugging.
2. *(Optional)* The client sends a `presence` social lock for the current scope.
3. When the user starts editing a concrete resource, the client sends an `editor` social lock for that resource.
4. The user creates or modifies annotations locally.  
   - **Create**: new IDs are generated; no conflict possible.  
   - **Update fields or change erasability**: the user records `expectedVersion` at load time.

5. On save: the backend handles the operation according to its type.  
   - **Create**: the backend inserts a new document with its initial `version`; no `expectedVersion` check is needed.  
   - **Update fields** (geometry and data only): the backend performs a conditional write using `expectedVersion`. If the write succeeds, it returns the new `version`; otherwise it returns a conflict error and the client shows a resolution dialog.  
   - **Change erasability** (geometry, data, and link): the backend performs a conditional write on `erasableAt`/`erasableBy` using `expectedVersion`. Succeeds or returns a conflict error identically to a field update. For `annotationLink` this is the only supported in-place mutation.  
   - **Link restore**: restoring an `annotationLink` to `non-erasable` changes only the link itself. Whether geometry or data should also be promoted back to `non-erasable` is a higher-level workflow decision, not a primitive backend side effect.
6. The client sends an `editor` stop lock after save/cancel/close and may keep or stop the `presence` lock depending on whether the user remains active in the scope.

### Workflow 3: Scene Viewing

**Actors**: All users  
**Precondition**: No structuring operation is in progress.

1. The user calls `startReading(projectId, sceneId)` to verify access (rejected only if a structuring lock is held).
2. The scene and all its annotations are loaded as a local snapshot.
3. The user explores the scene freely. No locking is involved.
4. Remote changes made after the snapshot was taken are not applied automatically. They become visible only if the user explicitly refreshes the changed annotations after a notification, or reloads the scene.
5. The user calls `stopReading(projectId, sceneId)` when done.

---

## Concurrency Rules Summary

| # | Rule |
| --- | --- |
| 1 | While a structuring operation is in progress, all other operations (read, view, edit) are blocked. |
| 2 | Any user may view any scene whenever no structuring operation is in progress, regardless of concurrent edits. |
| 3 | Multiple users may edit annotations in the same scene concurrently (optimistic strategy). |
| 4 | All mutating operations use the same `expectedVersion` OCC check. `annotationGeometry` and `annotationData` support `update`, `markErasable`, and `markNonErasable`. `annotationLink` supports `markErasable` and `markNonErasable` (its `geometryId`/`dataId` endpoints are immutable after creation). No operation type has automatic priority. |
| 5 | Both the `version` value and the persisted `erasableAt` state are validated atomically before any write is applied. |
| 6 | Social Lock messages are best-effort informational only. The model is correct even if those messages are delayed or absent. |
