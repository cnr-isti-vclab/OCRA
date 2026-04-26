# Structuring Lock and Project Presence in OCRA

## Status

This document defines the target design for project-wide structuring coordination in OCRA.

It describes the intended backend model, lock lifecycle, API surface, and future multi-backend compatibility strategy. Unless stated otherwise, this is design documentation for the next implementation phase, not a description of fully implemented backend behaviour.

---

## Purpose

Structuring operations modify the project topology and the reference spaces on which scenes, assets, and annotations depend. Typical examples are:

- deleting a scene
- attaching or detaching an asset from a scene
- repositioning an asset inside a scene
- publishing HDT data that changes project-visible structure

These operations differ from ordinary annotation editing because they can invalidate assumptions held by other active sessions. A concurrent viewer or editor may be reading a scene snapshot that becomes structurally obsolete while a structuring operation is being applied.

The purpose of the exclusive structuring lock is therefore:

- to guarantee that only one session can perform structuring on a project at a time
- to prevent non-owner sessions from entering or continuing project-scoped operations while structuring is in progress
- to ensure that the project reaches a structurally consistent state before other sessions resume normal access

The lock is project-wide. It protects the whole project surface, including project metadata, scenes, scene assets, and project-scoped annotations affected by structural changes.

---

## Design Goals

The adopted model aims to satisfy the following goals:

- strong correctness for project-wide structuring operations
- minimal long-lived state for annotation editing, which remains based on optimistic concurrency control
- clear separation between domain entities and concurrency-coordination entities
- compatibility with a future multi-backend deployment without rewriting the lock semantics

This leads to a design in which structuring coordination is handled by dedicated persistent models, separate from the canonical `Project`, `User`, and annotation entities.

---

## Adopted Model

The adopted model uses two persistent coordination entities stored in PostgreSQL alongside the existing backend session model.

### Canonical Domain Entities

The following models remain the canonical domain entities:

- `Project`
- `User`
- `Session`

They are not replaced by the locking model.

### Coordination Entities

Two auxiliary models are introduced for concurrency coordination:

- `StructuringLock`
- `ProjectPresenceLease`

These models are auxiliary in the sense that they do not represent the business domain itself. They represent temporary coordination state needed to enforce project-wide exclusivity.

### Why Separate Models

The lock and presence state are intentionally not embedded directly into `Project`, `User`, or `Session` because their lifecycle and cardinality are different.

- a project may temporarily have one active lock, or none
- a project may have many concurrent presence leases
- a user may participate in many project sessions over time
- a session may be authenticated without currently being active in any project

Using separate models keeps the concurrency layer explicit, queryable, and extensible.

---

## Persistent Data Model

### `StructuringLock`

`StructuringLock` is the source of truth for exclusive project-wide structuring ownership.

Suggested fields:

- `id`
- `projectId`
- `ownerSessionId`
- `ownerUserId`
- `state`
- `fencingToken`
- `operationType`
- `operationContext`
- `heartbeatExpiresAt`
- `acquiredAt`
- `releasedAt` optional
- `createdAt`
- `updatedAt`

### `ProjectPresenceLease`

`ProjectPresenceLease` tracks which sessions are currently active in a project and in which mode.

Suggested fields:

- `id`
- `leaseKey`
- `projectId`
- `sessionId`
- `userId`
- `mode`
- `sceneId` optional
- `clientInstanceId` optional
- `lastHeartbeatAt`
- `heartbeatExpiresAt`
- `createdAt`
- `updatedAt`

`leaseKey` is a backend-generated canonical identifier for one logical lease. It allows idempotent refresh and stop operations without depending on a compound unique constraint that includes nullable fields such as `sceneId`.

### Presence Modes

The initial design uses three presence modes:

- `viewing`
- `editing`
- `structuring`

### Lock States

The initial lock state machine uses two persistent states:

- `draining`
- `exclusive`

`releasing` is intentionally omitted from the first iteration to keep the state machine minimal. Release is modelled as record deletion.

---

## State Machine

The initial state machine is:

`absent -> draining -> exclusive -> absent`

### `absent`

No active structuring lock exists for the project.

### `draining`

The lock has already been acquired by one session, but other presence leases may still exist in the project. During this phase:

- the owner session is the only session allowed to continue toward structuring
- new non-owner project access is rejected
- existing non-owner sessions are expected to leave voluntarily or expire via heartbeat timeout

### `exclusive`

The draining phase is complete. The lock owner is the only active session allowed to operate within the project scope until the lock is released or expires.

### Release

When structuring completes successfully, the `StructuringLock` record is removed and the project returns to `absent`.

---

## Core Invariants

The implementation must preserve the following invariants.

1. At most one active `StructuringLock` may exist per project.
2. Lock ownership is bound to `sessionId`, not only to `userId`.
3. Lock acquisition happens before checking whether the project is otherwise empty.
4. A lock is considered dead when `heartbeatExpiresAt <= now`.
5. A stale owner must not continue to act after lock expiry and re-acquisition by another session.
6. Presence is project-scoped state, not a synonym for authentication.
7. Annotation OCC remains independent from structuring lock ownership.

---

## Why Lock Acquisition Happens Before Draining Check

The system must not first inspect active sessions and only then create the lock. That would leave a race window:

1. Session A checks that no other active project sessions exist.
2. Before A writes the lock, Session B enters the project.
3. Session A writes the lock based on stale knowledge.

The correct order is:

1. acquire the project lock in `draining`
2. reject all new non-owner project access from that moment onward
3. evaluate whether any other presence leases remain
4. promote to `exclusive` only when all other leases have disappeared or expired

---

## Presence and Heartbeat Model

`ProjectPresenceLease` is the mechanism used to determine whether the project is still occupied by other sessions.

Presence is distinct from backend authentication sessions:

- a backend `Session` proves that the user is authenticated in the application
- a `ProjectPresenceLease` proves that a specific session is currently active in a specific project

This distinction is important because a user may stay logged in while not actively reading or editing any project.

### Lease TTL

The intended model uses expiring leases.

- the client periodically refreshes the lease heartbeat
- a closed tab, crash, or disconnect causes the lease to disappear automatically after its TTL
- draining completion is therefore based on non-expired leases only

This avoids requiring perfect cleanup from every client.

### Visibility Changes and Presence Cleanup

Changing a project from `public` to `private` should not wait only for lease TTL when the backend can already determine that some active leases belong to users who are no longer entitled to remain in the project.

The intended behaviour is:

- when a project changes from `public` to `private`, the backend immediately removes active `ProjectPresenceLease` rows belonging to non-members
- if an active `StructuringLock` was waiting in `draining` only because of those now-invalid public leases, the backend should immediately reevaluate and promote it to `exclusive` when appropriate
- any remaining valid leases still fall back to normal TTL-based draining behaviour

This keeps correctness simple while avoiding unnecessary waiting after a visibility downgrade.

---

## Lock Lifecycle

### 1. Start Structuring

When a privileged session requests `startStructuring(projectId)`:

1. the backend verifies authorisation
2. the backend attempts to create or take over the `StructuringLock` for the project in state `draining`
3. the backend records or refreshes the owner's `ProjectPresenceLease` in mode `structuring`
4. the backend begins rejecting non-owner project access
5. if no other non-expired presence leases exist, the lock is promoted immediately to `exclusive`
6. otherwise the project remains in `draining` until the remaining leases disappear or expire

### 2. Heartbeat Structuring

The owner session periodically refreshes the lock heartbeat.

The request succeeds only if:

- the lock exists
- the caller owns it
- the lock has not already expired

The heartbeat also refreshes the owner's `structuring` presence lease.

### 3. Promote to Exclusive

Promotion to `exclusive` happens when the backend determines that no non-owner, non-expired project presence leases remain.

The promotion may be performed lazily when:

- a presence lease is stopped
- a presence heartbeat updates lease state
- a structuring heartbeat runs
- an expired lease is detected during project access checks

### 4. Stop Structuring

When the owner completes the operation:

1. the backend verifies ownership
2. the structuring operation commits its final changes
3. the `StructuringLock` is deleted
4. the owner's presence lease is removed or downgraded from `structuring`

### 5. Recovery from Expired Lock

If the owner crashes or disconnects, the lock becomes invalid when `heartbeatExpiresAt` expires.

Another session may then acquire the lock, but only through an atomic conditional takeover. This is where `fencingToken` becomes useful to prevent stale owners from completing delayed work after losing ownership.

---

## Fencing Token

`fencingToken` is a monotonically increasing integer associated with each new lock acquisition.

Its purpose is defensive correctness:

- if an old lock owner continues running after expiry
- and a new owner has already acquired the lock
- then any operation still carrying the old fencing token can be rejected

The first implementation may not immediately propagate the token through every project mutation path, but the field should exist from the beginning so that the design remains safe to extend.

---

## Operations Covered by the Lock

The structuring lock is intended to protect project-wide structural commit operations, such as:

- deleting scenes
- attaching assets to scenes
- detaching assets from scenes
- repositioning scene assets
- publishing HDT data that changes the project-visible structure

The design deliberately distinguishes between:

- preparation work that can happen outside the lock
- structural commit work that changes the project-visible topology and must happen under the lock

Examples:

- creating a new project does not require a project-level structuring lock
- uploading an asset file does not by itself require the lock
- attaching that asset into a visible scene does require the lock

### Destructive Operation Policy

Destructive operations must be treated as structuring commits, not as ordinary CRUD.

The caller must already own the project-wide structuring lock in `exclusive` state before the backend starts any irreversible deletion.

#### `project.delete`

`project.delete` is a hard delete of the whole project scope.

Execution order:

1. verify that the caller is authorised to delete the project
2. verify that the caller owns the active `exclusive` structuring lock for that project
3. delete all project-scoped annotations
4. delete the HDT document for the project
5. remove the project filesystem subtree under `project_files/<projectId>`
6. delete the PostgreSQL `Project` row last so relational cascades remove roles, presence leases, and the structuring lock row itself

This order is important because PostgreSQL `ON DELETE CASCADE` does not cover MongoDB documents or project files on disk.

The current implementation now applies this policy for `project.delete`.

#### `scene.delete`

`scene.delete` must also run under the project-wide structuring lock.

Required cascade policy:

- remove the scene from the HDT document
- remove all annotation geometries whose `referenceType=scene` and `referenceId=<sceneId>`
- remove all annotation data whose `visibilityType=scene` and `visibilityId=<sceneId>`
- remove all annotation links that become orphaned because one endpoint was removed

Deleting a scene must not silently leave dangling annotations that still point to a scene identifier that no longer exists.

The current implementation now applies this policy for `scene.delete`.

#### `asset.delete`

`asset.delete` must also run under the project-wide structuring lock.

Required cascade policy:

- remove the asset from the HDT digital asset pool
- remove the asset reference from every scene that contains it
- remove the asset files on disk
- remove all annotation geometries whose `referenceType=asset` and `referenceId=<assetId>`
- remove all annotation data whose `visibilityType=asset` and `visibilityId=<assetId>`
- remove all annotation links that become orphaned because one endpoint was removed

Deleting an asset does not automatically imply deleting every scene that used it. Scene deletion should remain an explicit policy decision, unless the product later defines that an empty scene must be auto-removed.

The current implementation now applies this policy for `asset.delete`.

#### `user.disable`

Administrative user removal should not be implemented as ordinary hard delete in production flows.

Recommended policy:

- keep the user row for attribution, audit history, and authorship references
- block new sessions and prevent further access
- hide the user from normal active-user selection flows
- optionally anonymise personal fields later if compliance requires it
- a `sys_admin` user must never transition to disabled state

In practice this should be modelled as user disable or soft delete, for example with fields such as `isActive`, `disabledAt`, `disabledBy`, and `disableReason`, rather than physically deleting the row.

The current implementation now applies this policy as an administrative status transition rather than a hard delete. Disabling a user also invalidates their active backend sessions and removes any presence lease or structuring lock still owned by that user. A system administrator is explicitly protected from being disabled by this endpoint.

---

## Enforcement Model

Once a valid `StructuringLock` exists for a project, all project-scoped routes must enforce it consistently.

The intended enforcement rules are:

1. if no active lock exists, normal project access is allowed
2. if an active lock exists and the request session is the owner, access is allowed
3. if an active lock exists and the request session is not the owner, project-scoped access is rejected

For the first implementation, `draining` and `exclusive` should both reject non-owner project access. This is simpler and avoids ambiguous intermediate behaviour.

---

## Future Forced Drain and User Notification

The first version does not require forced logout. The initial design can rely on lease expiration and voluntary client exit.

Later improvements may add:

- SSE notifications that warn non-owner sessions that project draining has started
- explicit UI messages asking viewers or editors to leave the project
- server-initiated invalidation of OCRA backend sessions for project participants when necessary

This should be treated as a later quality-of-experience enhancement, not as a prerequisite for the correctness of the lock.

---

## Multi-Backend Extensibility

The lock and presence models are designed to remain correct even if the backend later runs on multiple hosts.

### What Already Scales Correctly

If all backend instances share the same PostgreSQL and MongoDB databases:

- the lock source of truth remains correct because it is persistent and shared
- presence leases remain correct because they are persistent and shared
- annotation optimistic concurrency control remains correct because it is enforced in MongoDB via conditional writes

### What Will Need Refactoring in a Multi-Backend Deployment

Realtime event propagation will need a later refactor.

Today, the annotation SSE broker is process-local. In a true multi-backend deployment, event propagation for:

- annotation mutation notifications
- social-lock notifications
- future structuring-drain notifications

must move to a shared event transport such as:

- Redis Pub/Sub
- PostgreSQL LISTEN/NOTIFY
- another cross-node messaging layer

This future change should affect realtime propagation, not the semantics of lock ownership.

### Design Principle

Correctness must depend on shared persistent state.

Realtime notification is important for UX, but it must not be the source of truth for lock validity or project access enforcement.

---

## Minimal API Surface

The first API surface should stay narrow and explicit.

---

## Team Migration Command

When a developer is authoring a new committed Prisma migration, use `prisma migrate dev --create-only` to generate the migration artifacts locally before review and commit. For example:

```bash
cd /home/<user>/git/OCRA/backend && npx prisma migrate dev --name add_structuring_lock_models --create-only
```

This creates the migration artifacts that can then be reviewed and committed.

When one or more Prisma migrations have already been committed to the repository, every team member must apply them to the local PostgreSQL database after pulling the updated branch.

Recommended command:

```bash
cd /home/<user>/git/OCRA/backend && npx prisma migrate deploy && npx prisma generate
```

This command:

- applies all committed Prisma migrations to the local database
- regenerates the Prisma client so that the new models are available in the backend code

For OCRA this is the standard team-side command to run after a schema change has already been created and committed by whoever prepared the migration. This is the path to use for any committed migration, including later schema changes such as user lifecycle fields, not only the initial structuring-lock models.

### Structuring Lock APIs

#### `POST /api/projects/:projectId/structuring/start`

Starts the structuring lock lifecycle for the current session.

Request body:

```json
{
  "operationType": "scene.delete",
  "operationContext": {
    "sceneId": "scene-123"
  }
}
```

Expected behaviour:

- verifies permissions
- atomically acquires the project lock in `draining`
- creates or refreshes owner presence in `structuring`
- promotes to `exclusive` immediately if no non-owner presence remains

Successful response example:

```json
{
  "success": true,
  "state": "draining",
  "projectId": "proj-123",
  "ownerSessionId": "sess-123",
  "fencingToken": 4,
  "heartbeatExpiresAt": "2026-04-26T10:00:00.000Z",
  "remainingPresenceCount": 2
}
```

Main error cases:

- `401` not authenticated
- `403` insufficient privileges
- `409` another active structuring lock already exists

#### `POST /api/projects/:projectId/structuring/heartbeat`

Refreshes the active structuring lock heartbeat for the owner session.

Request body:

```json
{
  "fencingToken": 4
}
```

Successful response example:

```json
{
  "success": true,
  "state": "exclusive",
  "projectId": "proj-123",
  "fencingToken": 4,
  "heartbeatExpiresAt": "2026-04-26T10:00:15.000Z"
}
```

Main error cases:

- `401` not authenticated
- `403` caller is not the lock owner
- `409` fencing token mismatch
- `410` lock expired or no longer exists

#### `POST /api/projects/:projectId/structuring/stop`

Releases the active lock owned by the current session.

Request body:

```json
{
  "fencingToken": 4
}
```

Successful response example:

```json
{
  "success": true,
  "projectId": "proj-123",
  "released": true
}
```

Main error cases:

- `401` not authenticated
- `403` caller is not the lock owner
- `409` fencing token mismatch
- `410` lock already expired or missing

### Presence APIs

#### `POST /api/projects/:projectId/presence/start`

Registers project presence for the current session.

Request body:

```json
{
  "mode": "viewing",
  "sceneId": "scene-123",
  "clientInstanceId": "tab-a"
}
```

Successful response example:

```json
{
  "success": true,
  "projectId": "proj-123",
  "mode": "viewing",
  "heartbeatExpiresAt": "2026-04-26T10:00:00.000Z"
}
```

Main error cases:

- `401` not authenticated
- `423` project locked by another structuring session

#### `POST /api/projects/:projectId/presence/heartbeat`

Refreshes a project presence lease.

Request body:

```json
{
  "mode": "viewing",
  "sceneId": "scene-123",
  "clientInstanceId": "tab-a"
}
```

Successful response example:

```json
{
  "success": true,
  "projectId": "proj-123",
  "mode": "viewing",
  "heartbeatExpiresAt": "2026-04-26T10:00:15.000Z"
}
```

Main error cases:

- `401` not authenticated
- `423` project locked by another structuring session

#### `POST /api/projects/:projectId/presence/stop`

Stops a project presence lease.

Request body:

```json
{
  "mode": "viewing",
  "sceneId": "scene-123",
  "clientInstanceId": "tab-a"
}
```

Successful response example:

```json
{
  "success": true,
  "projectId": "proj-123",
  "stopped": true
}
```

The stop operation should be idempotent.

---

## Frontend Integration Scaffold

The frontend now contains a minimal, low-intrusion scaffold that another team can adopt without refactoring the current project pages.

### Available Frontend Building Blocks

The following files are intended as the starting point for frontend adoption:

- `frontend/src/services/ProjectStructuringService.ts`
- `frontend/src/services/ProjectStructuringCoordinator.ts`
- `frontend/src/services/StructuringEventsService.ts`
- `frontend/src/services/StructuringDrainingNotifier.ts`

This scaffold no longer relies on the annotation SSE channel for structuring notifications.

### What Each Frontend Piece Is For

#### `ProjectStructuringService`

Thin REST client for the backend endpoints:

- `presence/start`
- `presence/heartbeat`
- `presence/stop`
- `structuring/start`
- `structuring/heartbeat`
- `structuring/stop`

It also normalises backend API failures into a dedicated `ProjectStructuringApiError` carrying:

- HTTP status
- backend error code
- optional details payload

#### `ProjectStructuringCoordinator`

Small orchestration layer for the session that wants to perform a structuring commit.

It provides a `runExclusiveOperation(...)` helper that:

1. starts structuring for the current project
2. waits until the lock reaches `exclusive`
3. keeps the lock alive with heartbeats while the operation is running
4. releases the lock in a `finally` block

This lets the feature team plug one irreversible operation into a stable acquire-heartbeat-release flow instead of reimplementing it ad hoc inside page components.

#### `StructuringEventsService`

Dedicated SSE client for project-wide structuring notifications.

It connects to:

- `GET /api/projects/:projectId/structuring/events`

and can also publish draining lifecycle signals through:

- `POST /api/projects/:projectId/structuring/events/draining/start`
- `POST /api/projects/:projectId/structuring/events/draining/stop`

It exposes callbacks for:

- connection state changes
- `structuring.draining.started`
- `structuring.draining.stopped`

#### `StructuringDrainingNotifier`

Small adapter that plugs `StructuringEventsService` into `ProjectStructuringCoordinator`.

The companion helper `isStructuringDrainingEvent(...)` allows UI code to recognise those events and display a banner, modal, or soft redirect prompt.

### Recommended Frontend Usage Pattern

The intended adoption pattern is:

1. when a page enters a project, start or refresh project presence using `ProjectStructuringService`
2. keep a project-wide SSE listener open with `new StructuringEventsService(projectId)` so the page can observe draining signals
3. when a privileged user wants to execute a structuring commit, reuse that same `StructuringEventsService` instance as the notification emitter
4. wrap the irreversible backend call with `ProjectStructuringCoordinator.runExclusiveOperation(...)`
5. during draining, surface a UI message to non-owner sessions and stop their project presence when the user leaves the page or accepts the prompt

Illustrative example:

```ts
const structuringEvents = new StructuringEventsService(projectId);
structuringEvents.connect({
  onDrainingStarted: (event) => {
    if (isStructuringDrainingEvent(event)) {
      // Show a banner or modal telling the user that the project is draining.
    }
  },
});

const structuringService = new ProjectStructuringService(projectId);
const coordinator = new ProjectStructuringCoordinator(projectId, structuringService);
const drainingNotifier = new StructuringDrainingNotifier(structuringEvents);

await coordinator.runExclusiveOperation(
  {
    operationType: 'scene.delete',
    operationContext: { sceneId },
    drainingNotifier,
  },
  async () => {
    await fetch(`/api/projects/${projectId}/hdt/scenes/${sceneId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },
);
```

### Current Scope of the Dedicated Structuring SSE Channel

The new dedicated channel is intentionally narrow.

Today it covers:

- `structuring.draining.started`
- `structuring.draining.stopped`

This is enough to support the first frontend adoption phase without coupling the feature to annotation SSE semantics.

### Intended Next Backend Step

If the UX later needs richer lifecycle feedback, the same channel can grow with additional events such as:

- `structuring.exclusive.acquired`
- `structuring.exclusive.released`
- `structuring.lock.expired`

The frontend entry points can remain `StructuringEventsService`, `ProjectStructuringService`, and `ProjectStructuringCoordinator`.

---

## Recommended Initial Behaviour

The first implementation should optimise for correctness and simplicity.

- use shared persistent lock state in PostgreSQL
- use shared persistent project presence leases in PostgreSQL
- reject all non-owner project access while the lock is active
- keep annotation OCC unchanged
- defer cross-node realtime propagation and forced drain automation to a later iteration

This gives OCRA a correct and extendable structuring concurrency model without prematurely committing to a specific multi-backend event architecture.