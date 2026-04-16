# Concurrency Strategy for Annotations (Recommendation)

Based on the requirements and characteristics of the OCRA system (annotations composed of Geometry, Data, Link), here is an analysis to define the best concurrency strategy.

## Initial Requirements
1. **Rare actual concurrency:** Maximum of 2-3 users per scene, with a high probability that there will be only one person at a time working on the same annotation.
2. **Long operation times:** 1-10 minutes to create or edit a complex annotation.
3. **Implementation simplicity:** Strong preference for a maintainable architecture, avoiding over-engineering.

---

## Recommended Choice: Optimistic Approach (Optimistic Concurrency Control)

Considering the constraints, **the Optimistic approach is vastly superior**.

Here is why the other (Pessimistic) solutions would be inconvenient:
* If we used a *lock on the entire asset/scene* for 10 minutes, we would block the other users from making any other annotations (even in completely different areas of the scene) for a very long time. It would be extremely frustrating.
* If we used a *fine-grained lock on the single annotation*, we would have to implement a complex heartbeat system (to prevent a disconnection in the middle of those 10 minutes from locking the record forever). This would exponentially increase complexity and go against the simplicity requirement.

The **optimistic approach**, on the other hand, shines exactly in the described scenario: "high probability of success, low risk of conflict".

### How the Optimistic Approach Works for OCRA
The approach relies on cross-checking the version (`__v` or `updatedAt`) at the time of saving.

1. **Creation (Create):** No concurrency issues. The user works locally for 10 minutes to define `geometry`, `data`, and `link`. Once finished, they execute the database insert. Since these are new records (new IDs), there is no possibility of overwriting.
2. **Modification (Update):** When the user starts modifying an existing geometry or content, they note the current version (e.g., version `v1`).
   * Working for x minutes.
   * Clicking "Save".
   * The backend attempts to perform the update **only if** the database version is still `v1`. If successful, the version becomes `v2`.
   * *The rare case:* If another user has saved in the meantime, the call fails. The user is notified that the data has been modified by a third party and is asked if they want to forcefully overwrite or reload the updated data (exactly how Wikis or CMSs do).
3. **Deletion (Delete):** Same principle as Update. A request is made to delete the record at version `v1`. If it's already `v2` (or has already been deleted), the action is blocked or the user is warned.

### Crucial Advantage: Simplicity
You don't need heartbeats, browser crash handling (if the browser crashes at minute 5, the user loses their local work, but the DB doesn't stay locked), or background jobs cleaning up pending locks. The architecture is entirely *Stateless*.

---

## Mitigating the "Lost Work" Risk (Social Lock)

The only flaw of the Optimistic Approach is that, in the rare event that 2 users are working on the *exact same annotation* simultaneously, the second one to click "Save" will have their work rejected (potentially having wasted 5 minutes).

To mitigate this, while keeping the base implementation simple, the concept of a **Social Lock** can be adopted in the future:
* It is purely visual (the backend does not prevent saves).
* When a user selects an annotation to edit, the frontend makes a very lightweight call (e.g., via websocket or a temporary insertion with a 1-minute expiration).
* On other users' schemas, a simple icon appears (e.g., 🔒 "Mario is editing this element").
* The second user, seeing the warning, knows it's best not to modify the same annotation to avoid conflicts.
* If Mario crashes or leaves, the warning disappears on its own after a minute, without jamming the database.

### Handling the Data Split into Geometry, Data, Link
Being separate makes concurrent editing even less problematic!
If User A is improving the `Geometry` (adjusting 3D pointers) and User B is fixing a typo in the textual `Data` of the same annotation, since they are separate DB records with separate versions, **both saves will perfectly succeed without any conflict**. The `Link` will continue to connect the new geometry to the new data.

## Keeping Users in Sync (Real-Time Notifications)

With an optimistic model, conflicts only emerge when saving to the database. To minimize the probability of concurrent users accidentally working on stale data, it is a best practice to keep all active viewers and editors in sync.

### Synchronization Channels
The backend can emit events whenever a mutation (Create, Update, Delete) succeeds. This can be achieved through:
1. **WebSockets or Server-Sent Events (SSE):** For immediate, low-latency push notifications.
2. **Short Polling:** If maintaining persistent connections is difficult, clients can poll a lightweight `get/updates?since=...` endpoint every ~30 seconds.

### Client-Side Handling Strategies
When the frontend receives a "Data Changed" notification for the current scene, it should react depending on the user's current status:

1. **Viewing Mode (Passive Viewer):**
   If the user is simply observing the 3D scene, the frontend can seamlessly fetch the updated annotation and re-render it in the background without interrupting the user. This ensures they always see the latest state.
2. **Editing Mode (Active Editor):**
   If the user receives an alert that the *exact annotation* they are actively editing has just been modified by someone else, the frontend should immediately show an alert (e.g., *"Warning: The annotation you are editing has been updated by another user"*). The user can then:
   *   **Reload:** Discard their local draft and pull the latest version to avoid working in vain.
   *   **Proceed anyway:** Acknowledge the risk. When they try to save, the standard Optimistic check (via `expectedUpdatedAt`) will safely block the overwrite, and the UI can propose a forced overwrite or a merge.

This notification system operates on the same channel as the previously mentioned "Social Lock", allowing viewers to be fully aware of the collaborative environment.

### Summary
The Optimistic path offers the best ratio between development simplicity and user experience (especially when supported by the visual Social Lock and asynchronous update notifications to the clients). Developing structural pessimistic database locks given such long edits and such a limited user base would result in enormous technical debt.
