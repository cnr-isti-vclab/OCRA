# Synchronization for Concurrent Annotation Editing

This document summarizes the key points discussed regarding synchronization management for collaborative editing between the frontend (OpenLIME 2D, Viewer3JS 3D) and the backend (OCRA).

## 1. Middleware Objectives and Requirements
*   **Core Model:** It is necessary to define a formal model for database updates and bidirectional communication between the viewer/editor and the backend.
*   **Minimal Operations:** The middleware must support granular CRUD operations (adding/removing/modifying complete annotations or single geometries, links, contents) and include a system to receive updates from parallel external actions.
*   **Separation of Concerns:** Standard visualization features will be implemented in the Viewer, whereas highly application-specific and workflow-related logic will reside in OCRA.

## 2. Concurrency Strategies (Locking vs. Optimistic)
Two main approaches for managing modifications emerged during the discussion:

### A. Preemptive Lock with Heartbeat ("Pessimistic" Strategy)
*   **Mechanism:** When editing starts, the backend applies a temporary lock on the resource (periodically renewed via client "heartbeats", e.g., every 10s for a 30s lease). If the client freezes or disconnects, the lock automatically expires.
*   **Pros:** Prevents conflicts upfront. Guarantees the user that their work will not be lost upon commitment.
*   **Cons:** May prevent other users from working if the lock granularity is too broad or during long inactive sessions (partially mitigated by automatic expiration).

### B. Conditional Commit and Optimistic UI
*   **Mechanism:** The user works without strict pre-locks on the database. Upon completion, the operation validates the `last-edit-time` or the version (`__v`). If the backend data conflicts, the operation fails or requires reloading/validation.
*   **Social Locks:** Use of "Volatile Presence" logic (e.g., time-to-live TTL insertions). The interface warns users that someone is editing an element, without strictly locking it on the server level.
*   **Pros:** The editor remains highly responsive (Optimistic UI) and maximizes the initial freedom to work.
*   **Cons:** There is a concrete risk that a user might spend time editing only to have their work invalidated at the final save.

## 3. Granularity of Locks and Operations
At what level to apply reservation/concurrency:
*   **Coarse-Grained (Scene/Asset):** Easier to manage to avoid *deadlocks* and complexities derived from multi-table relationships. Given the expected use case (few real user overlaps), it offers an excellent compromise.
*   **Fine-Grained (Single entries: geo, data, link):** Maximizes potential parallelism but disproportionately increases management difficulty (guaranteeing resource lock closures, ensuring relational integrity upon commit).

## 4. Deletion Management: Soft Delete vs. Hard Delete
*   **Dangling Links:** In an asynchronous concurrent environment, allowing "hard delete" processes is dangerous, as an annotation creator might try to establish relationships with elements deleted moments prior.
*   **Soft Delete (`deletedAt`):**
    *   *Pros:* Resolves systemic issues caused by race conditions, easily supports restoration (undo), and makes distributed interactions safer.
    *   *Cons:* Drastically increases query complexity (forcing a flag to exclude "dead" records everywhere) and requires revising all internal orchestration policies among orphaned geometries, base data, and links.
*   **Proposed Compromise:** Keep the base semantics simple to avoid technical debt on core objects, perhaps applying pseudo-soft logic only to `annotationLink`s, which are purely relational.

## 5. Next Steps
*   It is necessary to officially decide whether to adopt a pessimistic validation workflow (with heartbeat-based locking) or an optimistic one (with conflict resolution at the end of the flow).
*   The actual impact of `deletedAt` on the project must be evaluated via further discussion, determining whether implementing it on geometries and data is worth the added solidity versus the risk of an overly complex backend.
