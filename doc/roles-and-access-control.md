# OCRA Roles and Access Control

This document describes the user role model and access control policy for OCRA. It is consistent with the ECHOES D8.1 deliverable (*Concepts for Vertical Applications*) and the canonical data model defined in [data-model.md](data-model.md).

## Illustrative Workflow (from D8.1)

The following example, drawn directly from the D8.1 deliverable, illustrates how the four roles interact in a realistic conservation-restoration scenario.

**Actors:** Anna (OCRA Admin), Bianca (Project Manager), Charles (Editor), Denise (Viewer).

Bianca is a conservator studying surface details and conservation issues in a historical painting. She wants her colleague Charles to analyse and annotate surface features — such as craquelure, retouching areas, and pigment degradation — using multiple Relightable Transformation Imaging (RTI) models of the artwork.

Anna, the OCRA administrator, grants Bianca the right to create projects. Bianca logs in, creates a new project (*"Retable of S. Bernardino – Surface Study"*), and becomes its manager by default. The project is **private**: only Bianca can see it at this point. She then assigns Charles the **Editor** role and Denise the **Viewer** role.

Bianca imports the relevant HDT from the ECHOES Knowledge Base, loads the two RTI assets (visible light and multispectral), adds them to a work scene, and asks Charles to begin annotation work.

Charles logs in, sees the project in his project list, opens the scene, and annotates relevant surface areas. Annotations are spatially bound to model coordinates and enriched with structured metadata. He saves his work and notifies Bianca and Denise.

Bianca and Denise open the project and review the annotations. Bianca, as manager, can modify or delete them; Denise, as viewer, can only read them. Once the review is complete, Bianca publishes the work into the HDT for long-term archival.

---

## 1. Role Model Overview

OCRA has two orthogonal levels of roles: **system-level** and **project-level**. System roles are global privileges stored as flags on the `User` entity. Project roles are per-project assignments stored in `ProjectRole`.

All OCRA application and API access is authentication-gated via Keycloak (OIDC). Anonymous users are outside the OCRA RBAC model and are not considered assignable roles in this document.

Resolution order:
1. `sys_admin` overrides all project-scoped checks.
2. `sys_creator` is evaluated for registry-level operations only.
3. Project-scoped roles (`manager`, `editor`, `viewer`) are evaluated for all project-specific operations.

---

## 2. System-Level Roles

| Role | Who has it | Capabilities |
| --- | --- | --- |
| `sys_admin` | OCRA platform administrator (e.g. *Anna* in D8.1 workflow) | Full system access. Can manage all users, assign `sys_creator` rights, access and modify all projects regardless of project role. Bypasses all project-scoped access checks. |
| `sys_creator` | Trusted user granted project creation rights by `sys_admin` | Can create new projects and vocabulary registry entries. Has no special privileges on projects already created by others unless explicitly assigned a project role on them. |
| Authenticated user | Any logged-in user without additional flags | Can browse public projects and their metadata. Cannot create projects or access private project content. |

> **D8.1 alignment**: The OCRA Admin role (Anna) corresponds to `sys_admin`. The act of "A gives to B project creation rights" in the D8.1 workflow corresponds to a `sys_admin` granting the `sys_creator` flag to a user.

---

## 3. Project-Level Roles

Project roles are assigned per project. A user may hold different roles in different projects. The permission hierarchy is `manager > editor > viewer`.

### 3.1 Manager

Corresponds to the *Project Creator and Manager* role in D8.1 (e.g. *Bern* / *Bianca* in the workflow examples).

- Created automatically as the project owner when a `sys_creator` creates a new project.
- Full control over the project: update metadata, delete the project, manage members.
- Exclusively controls structural project configuration: upload/remove assets, edit physical object metadata, create/delete scenes.
- Can create, edit, and delete annotations.
- Can export and publish HDT content (RDF export).
- The only role that can add, change, or remove project member roles.

### 3.2 Editor

Corresponds to the *Editor* role in D8.1 (e.g. *Carl* / *Charles* in the workflow examples).

- Can create, update, and mark-as-erasable annotations.
- Cannot manage scenes, scene-asset references, or digital assets.
- Cannot manage project membership or modify project metadata.
- Cannot upload or remove assets, nor publish HDT content.

### 3.3 Viewer

Corresponds to the *Viewer* role in D8.1 (e.g. *Denise* in the workflow examples).

- Read-only access to the full project HDT content: physical object metadata, digital assets, scenes, and annotations.
- Cannot create or modify any content.
- Can see the list of project members.

---

## 4. Public vs. Private Projects

Every project carries a `public` visibility flag (default: `false`).

### Private project (`public = false`)

- **Discoverable**: not listed and not accessible to users without an explicit project role assignment.
- **Access**: only users with a `ProjectRole` (`viewer`, `editor`, or `manager`) can see the project in listings and access its content.
- **Default state**: all newly created projects are private. Only the creating user (as `manager`) can see and access the project until they explicitly invite others.

> **D8.1 alignment**: *"Projects are by default private and can be seen only by the creator."*

### Public project (`public = true`)

- **Discoverable**: listed for all authenticated users and visible in project registries. Project metadata (name, description) is readable by any authenticated user.
- **Content access**: discoverability does **not** grant access to HDT content. Reading the HDT document, scenes, or annotations still requires an explicit project role assignment (`viewer` or above).
- In other words: `public = true` means *"this project exists and what it is about"* is visible to everyone authenticated; it does not mean the content is open.

| | Authenticated (no role) | Viewer | Editor | Manager |
| --- | --- | --- | --- | --- |
| See project in list | ✅ public only | ✅ | ✅ | ✅ |
| Read project metadata | ✅ public only | ✅ | ✅ | ✅ |
| Read HDT content | ❌ | ✅ | ✅ | ✅ |

---

## 5. The Structuring Lock and Its Interaction with Roles

Several write operations require not only the correct project role but also possession of a **StructuringLock**. This is a concurrency-control mechanism, not an authorization mechanism, but it has observable effects on what users can do at any given moment.

### How it works

- Only a `manager` (or `sys_admin`) can **acquire** a StructuringLock on a project. This transitions the project into `structuring` mode.
- While a lock is active, all write operations on HDT content (scenes, assets, annotations) are **blocked for all other sessions**, regardless of their role, returning HTTP `423 Locked`.
- Read operations (HDT document, scenes, annotations) are also blocked for non-owner sessions while a lock is held.
- The lock is bound to a specific backend **session**, not just a user. Two browser tabs for the same user represent different sessions.
- Some destructive operations (delete scene, delete asset, remove scene-asset reference, import physical object metadata, manage project members) require the lock to be in **exclusive** state, not just held.

### Lock state machine

```
No lock → [manager acquires] → draining → [presences expire] → exclusive → [manager releases] → No lock
```

### Effect on the permission matrix

The structuring lock does not change *who* is authorised but *when* an authorised user can act:

| Scenario | Effect on editor | Effect on manager (non-owner) |
| --- | --- | --- |
| No lock active | Normal role-based access | Normal role-based access |
| Lock active (draining or exclusive), different session | All writes blocked (423) | All writes blocked (423) |
| Lock active, same session as lock owner | Unaffected | Unaffected |
| Exclusive lock required, but lock is in `draining` state | Operation rejected (409) | Operation rejected (409) |

---

## 6. Permission Matrix

The legend below applies to all tables. Lock requirements (§5) are noted separately in column headers or footnotes where relevant.

- ✅ allowed
- ❌ denied
- ⚠️ conditional (see notes)
- 🔒 requires exclusive StructuringLock

### 6.1 Project Registry and Management

| Operation | Authenticated (no role) | Viewer | Editor | Manager | `sys_creator` | `sys_admin` |
| --- | --- | --- | --- | --- | --- | --- |
| List projects | ⚠️ public only | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read project metadata by id | ⚠️ public only | ✅ | ✅ | ✅ | ⚠️ public only | ✅ |
| Create project | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update project metadata | ❌ | ❌ | ❌ | 🔒 | ❌ | 🔒 |
| Delete project | ❌ | ❌ | ❌ | 🔒 | ❌ | 🔒 |
| List project members | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Add/update/remove member roles | ❌ | ❌ | ❌ | 🔒 | ❌ | 🔒 |

> **Note on member management**: adding/removing members requires the manager to hold an **exclusive** StructuringLock. This ensures no concurrent editing session is active when project membership changes.

### 6.2 HDT Content (MongoDB + Filesystem)

| Operation | Authenticated (no role) | Viewer | Editor | Manager | `sys_admin` |
| --- | --- | --- | --- | --- | --- |
| Read HDT document | ❌ | ✅ | ✅ | ✅ | ✅ |
| Read scene JSON | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create/update physical object metadata | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Delete physical object metadata | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Add digital asset metadata | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update digital asset metadata | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Delete digital asset metadata | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Upload asset files | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remove asset files | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Create/update scenes | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Delete scene | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Add/update scene-asset references | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Remove scene-asset references | ❌ | ❌ | ❌ | 🔒 | 🔒 |
| Read annotations | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create/update/delete annotations | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export/publish RDF | ❌ | ❌ | ❌ | ✅ | ✅ |

### 6.3 Vocabulary Registry

| Operation | Authenticated (no role) | Viewer | Editor | Manager | `sys_creator` | `sys_admin` |
| --- | --- | --- | --- | --- | --- | --- |
| List vocabularies | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read vocabulary by id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create vocabulary registry entry | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update/delete vocabulary registry entry | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 7. Documented Design Decisions (Resolved)

### DD-1 — Read operations blocked by StructuringLock: intentional

**Design intent**: when a manager acquires a StructuringLock, the project enters a mode in which the data structure is being reorganised (scenes deleted, assets rearranged, membership changed). Allowing concurrent reads during this window would expose a partially consistent view of the project to other sessions, which is misleading and can cause client-side state corruption (e.g. the viewer rendering a scene that no longer exists).

**Behaviour**: `enforceStructuringLock` middleware is applied to all routes under `/:projectId`, including GET requests. Any session that is not the lock owner receives `HTTP 423 Locked` for both reads and writes while the lock is active. This is intentional.

**Impact on roles**:
- `viewer` sessions are blocked from reading HDT content, scenes, and annotations while a structuring lock is active in that project.
- `editor` sessions are equally blocked.
- The lock owner (always a `manager`) is not affected.
- `sys_admin` should require lock only for `update`/`remove` project-content operations in §6.2 (rows marked `⚡` document the current implementation gap where lock bypass is still present).

**Lock duration**: locks are expected to be short-lived (a single focused restructuring session). The `heartbeatExpiresAt` field provides automatic expiry if the manager's session drops without releasing the lock explicitly.

**Client guidance**: frontends should handle `423 Locked` on read operations gracefully (e.g. show a "project is being restructured, please wait" message) rather than treating it as an access-denied error.

### DD-2 — Member management requires exclusive StructuringLock: intentional

**Design intent**: adding or removing project members during an active editing or annotation session would change the effective access set mid-session. An editor currently annotating would suddenly lose write access; a newly added viewer would see an inconsistent intermediate state. Requiring an exclusive lock before any membership change ensures the project is in a clean, quiesced state when its access policy changes.

**Behaviour**: `requireOwnedExclusiveStructuringLock()` is called before `add`, `update`, and `remove` member operations ([project-members.controller.ts](../backend/src/controllers/project-members.controller.ts)). The exclusive lock state is reached only after all active presence leases have expired (the `draining → exclusive` transition), guaranteeing no other session is actively working.

**Sequence for a manager modifying membership**:
1. Manager acquires StructuringLock → project enters `draining` state.
2. Active presence leases expire (other sessions finish or are notified).
3. Lock transitions to `exclusive` state.
4. Manager performs membership changes.
5. Manager releases the lock.

**Rationale for this placement in the access control model**: member management is architecturally a structuring operation on the project, not a content operation, because it modifies the authorization policy itself. Treating it symmetrically with other destructive structural changes (scene deletion, asset removal) is therefore consistent.

---

## 8. Relationship to ECHOES Publication

Project visibility and membership in OCRA are **application-internal** concepts. They are independent from publication to the ECHOES Knowledge Base or to external HDT repositories.

- A project can remain private in OCRA while its annotation content has been published to a governed ECHOES target.
- Conversely, a project can be public in OCRA without any governed publication having occurred.
- The `Export/publish RDF` operation (manager only) is the explicit action that initiates a governed publication path. Internal collaborative visibility and governed publication are separate concerns.

> **D8.1 alignment**: *"Internal collaborative visibility and governed publication are not the same thing. [...] Publication to shared or public targets is a separate action."*
