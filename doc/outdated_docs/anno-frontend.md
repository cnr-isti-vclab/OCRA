Annotations are delivered to the frontend from MongoDB through a dedicated API endpoint.
To support correct local annotation editing, it is necessary to replicate the MongoDB data structure locally and populate it with production data.

An editor user working on a project and viewing a specific scene must have access to the geometric annotations of the current scene and to the semantic data of the entire project — since data entities can be reused across scenes.

The local data structure must remain synchronized with the MongoDB structure and must support bidirectional updates:

* when an editor user modifies an annotation, the modification must first update the local data structure, then the global MongoDB state, and finally the mutation must be announced over the broadcast network;
* when the broadcast network announces a mutation affecting a project, the local structure of each connected user must be updated in order to keep the local copy synchronized with the global MongoDB state.

A real-time annotation system should therefore be implemented to support synchronization between MongoDB and the frontend local data structures, ensuring that all annotation changes are correctly propagated to all connected editor users. The system should be designed to handle modification conflicts and preserve data integrity during update operations.

Local structures representing copies of `annotationGeometry`, `annotationData`, and `annotationLink` for a given project must be defined, together with synchronization and conflict-resolution mechanisms capable of maintaining consistency between the frontend state and the MongoDB database.

---

## Proposed Implementation

### 1. Local Data Structures

The frontend mirrors the three MongoDB collections as in-memory maps, keyed by entity `id`. Each map holds a full snapshot of the entity as returned by the REST API, including the `version`, `erasableAt`, and audit fields.

```typescript
interface AnnotationStore {
  geometries: Map<string, AnnotationGeometry>; // entities visible in current scene (scene-scoped + asset-scoped)
  data:       Map<string, AnnotationData>;     // visible in current scene; grows on demand with project data
  links:      Map<string, AnnotationLink>;     // links whose geometry is visible in current scene
}
```

Two design constraints shape the scoping rules:

* `annotationGeometry` is positionally bound to a specific scene or asset via `referenceId`. Scene-scoped geometries have coordinates meaningful only within that scene; they are not reusable cross-scene. Asset-scoped geometries are defined in the asset's local frame and are visible in every scene that contains that asset. The store holds geometries visible in the current scene — both direct scene-scoped ones and asset-scoped ones whose asset appears in the scene.
* `annotationData` is semantic (label, class, vocabulary terms). It can be linked to geometries in any scene of the same project. Its visibility scope is either `scene` or `asset` (not always scene-only). The store starts with the data visible in the current scene or its assets and grows monotonically as the editor loads additional project data on demand.

Three auxiliary structures accompany the store and are reset on every scene change or reconnection:

```typescript
// Entities currently being updated or erased, keyed by "${kind}:${id}".
// Prevents double-submit while a write is in flight.
const isSaving = useRef(new Set<string>());

// Prevents a second "create annotation" submission while the first is still in flight.
// The entity id does not exist before the POST completes, so a boolean flag is used
// instead of a keyed set.
const isCreating = useRef(false);

// Monotonically incremented on every scene change or reconnection.
// Any async operation that finds a different value at completion is stale and discards its result.
const generation = useRef(0);
```

A metadata record tracks what data has already been fetched:

```typescript
interface AnnotationStoreMeta {
  loadedDataScopes: Set<string>; // scope keys whose data has been fully merged
  loadingScopes:    Set<string>; // scope keys whose fetch is currently in flight (concurrency guard)
  allProjectDataLoaded: boolean;
}
```

Each write function captures the pre-write store entry as a **local `snapshot` variable**. This is the only rollback mechanism — it lives in the function closure, not in shared state.

### 2. Initialization — Load then Connect

On mount (or whenever `projectId` or `sceneId` changes) the provider:

1. Increments `generation` — invalidates all in-flight results from the previous scope.
2. Clears `isSaving` and `isCreating`.
3. Creates a fresh `AnnotationApiClient` for the new `projectId`/`sceneId` pair.
4. Loads the scene bundle via a single REST call and populates the store.
5. **Only then** opens the SSE stream.

The sequential load-then-connect order eliminates the race where an SSE event arrives before the store is populated and is then silently overwritten when the bundle arrives.

```
1. generation++
2. bundle = await loadSceneBundle(sceneId)      ← REST, store is populated
     store.geometries ← bundle.geometries       (visible in scene: scene-scoped + asset-scoped for contained assets)
     store.data       ← bundle.data             (visible in scene: scene-scoped + asset-scoped, plus data reached via existing links)
     store.links      ← bundle.links            (geometryId ∈ store.geometries AND dataId ∈ store.data)
3. connectRealtime(handlers)                    ← SSE opened on a consistent store
```

### 3. On-Demand Loading of Additional Data

When the editor wants to link an existing data entity to a new geometry, they open a "link to existing data" picker. The picker calls `loadProjectData()` on mount — no manual trigger is required from the user.

**Backend prerequisite.** On-demand loading requires a project-wide data loading capability, e.g. `GET /api/projects/:projectId/annotations/data` without a `sceneId` filter, supporting `includeErasable`. Verify whether this endpoint already exists in the backend before adding it.

```typescript
async function loadProjectData() {
  if (meta.current.allProjectDataLoaded) return;
  if (meta.current.loadingScopes.has('__project__')) return; // fetch already in flight

  meta.current.loadingScopes.add('__project__');
  setIsLoadingAdditionalData(true);
  const myGen = generation.current;
  try {
    const data = await client.loadAllData();     // GET /annotations/data
    if (generation.current !== myGen) return;    // stale: scene changed during fetch
    for (const d of data) store.data.set(d.id, d); // union merge, never replace
    meta.current.allProjectDataLoaded = true;
    bump();
  } finally {
    meta.current.loadingScopes.delete('__project__');
    setIsLoadingAdditionalData(meta.current.loadingScopes.size > 0);
  }
}
```

The `'__project__'` sentinel in `loadingScopes` prevents concurrent invocations (e.g. from two pickers mounted simultaneously). The generation check discards the response if the scene changed while the fetch was in flight. Both guards require no coordination from the caller.

For very large projects the bulk load can be replaced by a paginated search API: the picker sends a search string and results are merged page by page as they arrive.

### 4. Write Path — Optimistic Local-First, First-Commit-Wins

Every write follows this protocol:

1. **Guard.** If `isSaving.has(key)`, return early — prevents double-submit.
2. **Snapshot.** Capture the current store entry in a local `const snapshot`. This is the only rollback value.
3. **Optimistic apply.** Update the store with the user's new values (keeping the existing `version`) and bump the revision. The UI reflects the change immediately.
4. **Mark saving.** Add `key` to `isSaving`.
5. **Backend write.** Dispatch the REST call with `expectedVersion: snapshot.version`.
6. **Commit or handle failure.**
   - **200:** Apply the user's values with the server's new version, but only if our version is not already stale (version guard — see below).
   - **409:** The server rejected our write because another user wrote first. Notify the user "your changes were not saved", fetch the current server version, apply the version guard before updating the store.
   - **Network error:** Roll back to `snapshot`, notify the user, allow retry.
7. **Clean up.** Remove from `isSaving`, bump revision. All steps after the `await` are skipped if `generation` has changed (stale result discarded).

**Conflict model.** OCC means the server accepts only the first writer with the correct `expectedVersion`; any concurrent writer receives a 409. From the server's perspective this is first-commit-wins: conflicting writes are never silently merged, the loser is notified, and the user must restart from the committed server state.

**Version guard on commit.** The SSE handler may update the store while a write is in flight. To avoid overwriting a more recent version that SSE has already applied, both the 200 and 409 paths apply the same guard before writing to the store: only write if the incoming version is ≥ the current store version.

```
editor saves geometry G (store has version 3):
  key = "geometry:G"
  isSaving.has(key)? → NO, proceed
  snapshot = store.geometries.get("G")         // { shapes: [old], version: 3 }
  store.geometries.set("G", { ...snapshot, shapes: [new] })   // optimistic, version still 3
  isSaving.add(key)
  bump()

  → PUT /geometry/G  { expectedVersion: 3, shapes: [new] }

    → 200 (version: 4):
        current = store.geometries.get("G")           // may be optimistic (v3) or SSE-advanced (v4+)
        if !current || 4 >= current.version:
          store.geometries.set("G", { ...current, shapes: [new], version: 4,
                                      updatedAt: res.updatedAt ?? current?.updatedAt ?? snapshot.updatedAt })
        [finally] isSaving.delete(key) ; bump()

    → 409:
        store.geometries.set("G", snapshot)           // rollback optimistic change
        server = await client.getGeometry(id)         // fetch current server state
        if server.version >= store.geometries.get("G").version:
          store.geometries.set("G", server)
        [finally] isSaving.delete(key) ; bump()
        → notify user: "your changes to G were not saved — another user modified it first"

    → network error:
        current = store.geometries.get("G").version
        if snapshot.version >= current:               // version guard before rollback
          store.geometries.set("G", snapshot)         // rollback only if SSE hasn't advanced us
        [finally] isSaving.delete(key) ; bump()
        → error notification; user may retry

  (if gen changed: store writes and bump are skipped — stale result discarded.
   isSaving.delete is also skipped because the scene-change init already cleared isSaving.
   isCreating.current = false is always executed unconditionally — it is a process-local flag,
   not store state, and must be reset regardless of generation to unblock future creates.)
```

**Creating a new annotation (geometry + data + link).** Because no entity id exists before the POST completes, `isSaving` cannot guard against double-submit — a dedicated `isCreating` boolean is used instead. Three POST calls are issued in sequence; each successful response is immediately inserted into the store:

```
isCreating = true
→ POST /geometry  { shapes, referenceType: 'scene', referenceId: sceneId }
    → store.geometries.set(geometry.id, geometry) ; bump()
→ POST /data      { label, class, content, visibilityType: 'scene', visibilityId: sceneId }
    (skipped if linking to an existing data entity — use its id directly)
    → store.data.set(datum.id, datum) ; bump()
→ POST /links     { geometryId, dataId }
    → store.links.set(link.id, link) ; bump()
isCreating = false   ← unconditional, even if gen changed
```

No OCC conflict is possible: POST always creates a fresh entity at version 1. If a step fails, the already-created entities are orphaned; a compensating delete should be attempted. Removal of unlinked entities depends on a defined backend GC policy — do not assume automatic cleanup unless that policy is explicitly guaranteed. The generation guard applies to each step: if the scene changes mid-creation, remaining results are discarded, but the in-flight POSTs are not cancelled.

Other clients receive an `annotation.mutated` SSE event with `mutation` set to `'geometry.created'`, `'data.created'`, or `'link.created'` respectively. `processSSEUpdate` handles new entities correctly: since `currentVersion` is `undefined` for an unknown id, the version guard passes vacuously and the entity is inserted unconditionally. The creator's own SSE echo is filtered out by `shouldDispatchForSession`.

### 5. SSE Read Path — Receiving Remote Mutations

All remote store updates flow through a single `processSSEUpdate` function. It applies two checks before writing to the store:

1. **Generation check.** If `gen.current` changed since the call started, the scene changed and the result is discarded.
2. **Version guard.** Write to the store only if the fetched version is ≥ the current store entry's version. This makes concurrent fetches for the same entity idempotent regardless of arrival order, and prevents an older SSE response from overwriting a newer one.

`processSSEUpdate` captures `gen.current` at call time (not at registration time), so the check remains valid across reconnections without stale closure values.

```typescript
async function processSSEUpdate(event: AnnotationMutationEvent) {
  const myGen = gen.current;             // captured at call time, never from a stale closure
  const { kind, id } = event.entity;
  const client = clientRef.current;
  if (!client) return;

  try {
    const fetched =
      kind === 'geometry' ? await client.getGeometry(id) :
      kind === 'data'     ? await client.getData(id)     :
                            await client.getLink(id);

    if (gen.current !== myGen) return;   // stale after reconnect or scene change

    // version guard: only advance the store, never regress
    const currentVersion =
      kind === 'geometry' ? store.current.geometries.get(id)?.version :
      kind === 'data'     ? store.current.data.get(id)?.version       :
                            store.current.links.get(id)?.version;
    if (currentVersion !== undefined && fetched.version < currentVersion) return;

    if (kind === 'geometry') store.current.geometries.set(id, fetched as AnnotationGeometry);
    else if (kind === 'data') store.current.data.set(id, fetched as AnnotationData);
    else                      store.current.links.set(id, fetched as AnnotationLink);
    bump();
  } catch (err) {
    console.error('[SSE] failed to process mutation, event will be lost', event, err);
  }
}
```

For `data` entities, `processSSEUpdate` inserts the fetched entity unconditionally even if its id was not in the initial scene bundle. For scene-scoped subscriptions (where the SSE stream is opened with a `sceneId` parameter), delivery is already filtered by impact and arrival implies relevance to the current scene. If a project-wide stream is ever used instead, this assumption no longer holds and an explicit relevance check would be required.

**Reconnection.** Increment `generation` (discards all in-flight results), clear `isSaving` and `isCreating`, notify the user if any edits were lost, and reload the scene bundle.

```typescript
onReconnect: async () => {
  const hadPending = isSaving.current.size > 0 || isCreating.current;
  gen.current++;
  const myGen = gen.current;
  isSaving.current.clear();
  isCreating.current = false;
  if (hadPending) notifyEditsCancelledOnReconnect();

  meta.current = { loadedDataScopes: new Set([sceneId]), loadingScopes: new Set(), allProjectDataLoaded: false };
  const bundle = await client.loadSceneBundle();
  if (gen.current !== myGen) return;
  store.current.geometries = new Map(bundle.geometries.map(g => [g.id, g]));
  store.current.data       = new Map(bundle.data.map(d => [d.id, d]));
  store.current.links      = new Map(bundle.links.map(l => [l.id, l]));
  bump();
}
```

### 6. Conflict Resolution — OCC and Social Locks

**Social locks (advisory).**  
When the editor opens an entity's form panel the provider calls `notifyEditorLockStart({ resourceType, resourceId })`. Other connected users receive `annotation.social_lock.started` and can show a "being edited by X" indicator. `notifyEditorLockStop` is called when the panel closes. Social locks are in-memory on the server and expire when the SSE stream drops. They do not prevent writes — they are purely advisory.

**UX warning during draft phase.**  
If an SSE mutation arrives for an entity whose editor panel is open (but the user has not yet clicked Save), the store is updated normally. The panel detects the change by storing the entity version at open time in a local ref and comparing it to the store version on every `revision` bump:

```typescript
// inside the editor panel component
const versionAtOpen = useRef(store.current.geometries.get(id)?.version);
const [remotelyModified, setRemotelyModified] = useState(false);
useEffect(() => {
  const current = store.current.geometries.get(id)?.version;
  if (current !== undefined && current !== versionAtOpen.current) setRemotelyModified(true);
}, [revision]);
```

When `remotelyModified` is true the panel shows a warning banner: "This entity was modified by another user while you were editing." The user can still click Save — the write will use the current store version as `expectedVersion`. If no further concurrent write has occurred the save succeeds; if another write raced it the user gets the 409 notification.

**Conflict outcomes (first-commit-wins via OCC, no merge dialog).**

| Scenario | Outcome |
|---|---|
| SSE arrives, entity idle | Store updated immediately (version guard applied). |
| SSE arrives, entity panel open (no save in flight) | Store updated; warning banner shown in panel. |
| SSE arrives, entity save in flight | Store updated if version advances; write may still succeed (200) or fail (409). |
| Save → 200 | Commit user's values + server version, if not already superseded by SSE. |
| Save → 409 | Fetch server state; notify "your changes were not saved"; store updated to server state. |
| Save → network error | Rollback to snapshot (version-guarded: only if SSE hasn't advanced the store); user notified; may retry. |
| Reconnect with save in flight | Save discarded; user notified; store hard-reset to scene bundle. |

### 7. React Integration — Complete Provider Sketch

```typescript
export function AnnotationProvider({ projectId, sceneId, children }) {
  const store      = useRef<AnnotationStore>({ geometries: new Map(), data: new Map(), links: new Map() });
  const meta       = useRef<AnnotationStoreMeta>({ loadedDataScopes: new Set(), loadingScopes: new Set(), allProjectDataLoaded: false });
  const isSaving   = useRef(new Set<string>());
  const isCreating = useRef(false);
  const gen        = useRef(0);
  const clientRef  = useRef<AnnotationApiClient | null>(null);
  const [revision, setRevision]                               = useState(0);
  const [realtimeState, setRealtimeState]                     = useState<AnnotationRealtimeState>('idle');
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  const bump = useCallback(() => setRevision(r => r + 1), []);

  // ── Initialization ────────────────────────────────────────────────────────────

  useEffect(() => {
    gen.current++;
    const myGen = gen.current;
    isSaving.current.clear();
    isCreating.current = false;
    meta.current = { loadedDataScopes: new Set([sceneId]), loadingScopes: new Set(), allProjectDataLoaded: false };

    const client = new AnnotationApiClient({ projectId, sceneId });
    clientRef.current = client;

    async function init() {
      const bundle = await client.loadSceneBundle();
      if (gen.current !== myGen) return;           // scene changed while loading
      store.current.geometries = new Map(bundle.geometries.map(g => [g.id, g]));
      store.current.data       = new Map(bundle.data.map(d => [d.id, d]));
      store.current.links      = new Map(bundle.links.map(l => [l.id, l]));
      bump();

      client.connectRealtime({
        onConnectionStateChange: setRealtimeState,
        onMutation: (event) => { void processSSEUpdate(event); },
        onReconnect: async () => {
          const hadPending = isSaving.current.size > 0 || isCreating.current;
          gen.current++;
          const rGen = gen.current;
          isSaving.current.clear();
          isCreating.current = false;
          if (hadPending) notifyEditsCancelledOnReconnect();
          meta.current = { loadedDataScopes: new Set([sceneId]), loadingScopes: new Set(), allProjectDataLoaded: false };
          const b = await client.loadSceneBundle();
          if (gen.current !== rGen) return;
          store.current.geometries = new Map(b.geometries.map(g => [g.id, g]));
          store.current.data       = new Map(b.data.map(d => [d.id, d]));
          store.current.links      = new Map(b.links.map(l => [l.id, l]));
          bump();
        },
      });
    }

    void init();
    return () => {
      gen.current++;                   // invalidate all in-flight operations
      clientRef.current = null;
      client.disconnectRealtime();
    };
  }, [projectId, sceneId]);

  // ── SSE processing ────────────────────────────────────────────────────────────

  async function processSSEUpdate(event: AnnotationMutationEvent) {
    const myGen = gen.current;
    const { kind, id } = event.entity;
    const client = clientRef.current;
    if (!client) return;

    try {
      const fetched =
        kind === 'geometry' ? await client.getGeometry(id) :
        kind === 'data'     ? await client.getData(id)     :
                              await client.getLink(id);

      if (gen.current !== myGen) return;

      const currentVersion =
        kind === 'geometry' ? store.current.geometries.get(id)?.version :
        kind === 'data'     ? store.current.data.get(id)?.version       :
                              store.current.links.get(id)?.version;
      if (currentVersion !== undefined && fetched.version < currentVersion) return;

      if (kind === 'geometry') store.current.geometries.set(id, fetched as AnnotationGeometry);
      else if (kind === 'data') store.current.data.set(id, fetched as AnnotationData);
      else                      store.current.links.set(id, fetched as AnnotationLink);
      bump();
    } catch (err) {
      console.error('[SSE] failed to process mutation, event will be lost', event, err);
    }
  }

  // ── Write helpers ─────────────────────────────────────────────────────────────

  const updateGeometry = useCallback(async (id: string, newShapes: AnnotationShape[]) => {
    const client = clientRef.current;
    if (!client) return;
    const key = `geometry:${id}`;
    if (isSaving.current.has(key)) return;

    const snapshot = store.current.geometries.get(id);
    if (!snapshot) return;                              // entity not in store — cannot write safely
    const myGen = gen.current;
    isSaving.current.add(key);
    store.current.geometries.set(id, { ...snapshot, shapes: newShapes });
    bump();
    try {
      const res = await client.updateGeometry(id, { expectedVersion: snapshot.version, shapes: newShapes });
      if (gen.current !== myGen) return;
      const current = store.current.geometries.get(id);
      if (!current || res.version >= current.version) {
        store.current.geometries.set(id, { ...current, shapes: newShapes, version: res.version, updatedAt: res.updatedAt ?? current?.updatedAt ?? snapshot.updatedAt });
      }
    } catch (err) {
      if (gen.current !== myGen) return;
      const currentOnError = store.current.geometries.get(id);
      if (!currentOnError || snapshot.version >= currentOnError.version) {
        store.current.geometries.set(id, snapshot);   // rollback only if SSE hasn't advanced us
      }
      if (isConflict(err)) {
        try {
          const server = await client.getGeometry(id);
          if (gen.current !== myGen) return;
          const current = store.current.geometries.get(id);
          if (!current || server.version >= current.version) {
            store.current.geometries.set(id, server);
          }
        } catch { /* leave snapshot in store */ }
        notifyConflict(id);                           // "your changes were not saved"
      } else {
        notifyWriteError(err);
      }
    } finally {
      if (gen.current === myGen) {
        isSaving.current.delete(key);
        bump();
      }
    }
  }, []);

  // updateData, markLinkErasable, markLinkNonErasable follow the same pattern as updateGeometry.

  const createAnnotation = useCallback(async (input: {
    shapes: AnnotationShape[];
    label: string;
    description?: string;
    class: string | null;
    content: Record<string, unknown>;
    existingDataId?: string;  // link to existing data entity instead of creating a new one
  }) => {
    const client = clientRef.current;
    if (!client || isCreating.current) return;

    // validate existingDataId before any POST to avoid creating an orphan geometry
    let existingDatum: AnnotationData | undefined;
    if (input.existingDataId) {
      existingDatum = store.current.data.get(input.existingDataId);
      if (!existingDatum) { notifyWriteError(new Error('data entity not in store')); return; }
    }

    const myGen = gen.current;
    isCreating.current = true;
    try {
      const geometry = await client.createGeometry({
        shapes: input.shapes,
        referenceType: 'scene',
        referenceId: sceneId,
      });
      if (gen.current !== myGen) return;
      store.current.geometries.set(geometry.id, geometry);
      bump();

      let datum: AnnotationData;
      if (existingDatum) {
        datum = existingDatum;
      } else {
        datum = await client.createData({
          label: input.label,
          description: input.description,
          class: input.class,
          content: input.content,
          visibilityType: 'scene',
          visibilityId: sceneId,
        });
        if (gen.current !== myGen) return;
        store.current.data.set(datum.id, datum);
        bump();
      }

      const link = await client.createLink({ geometryId: geometry.id, dataId: datum.id });
      if (gen.current !== myGen) return;
      store.current.links.set(link.id, link);
      bump();
    } catch (err) {
      if (gen.current === myGen) notifyWriteError(err);
      // attempt compensating cleanup; do not assume backend GC unless explicitly defined
    } finally {
      isCreating.current = false;   // unconditional: reset even if scene changed mid-flight
    }
  }, [sceneId]);

  // ── On-demand data loader ─────────────────────────────────────────────────────

  const loadProjectData = useCallback(async () => {
    const client = clientRef.current;
    if (!client || meta.current.allProjectDataLoaded || meta.current.loadingScopes.has('__project__')) return;
    meta.current.loadingScopes.add('__project__');
    setIsLoadingAdditionalData(true);
    const myGen = gen.current;
    try {
      const data = await client.loadAllData();          // project-wide data loading capability
      if (gen.current !== myGen) return;
      for (const d of data) store.current.data.set(d.id, d);
      meta.current.allProjectDataLoaded = true;
      bump();
    } finally {
      meta.current.loadingScopes.delete('__project__');
      setIsLoadingAdditionalData(meta.current.loadingScopes.size > 0);
    }
  }, []);

  // ── Derived read views ────────────────────────────────────────────────────────

  const geometries = useMemo(() => [...store.current.geometries.values()], [revision]);
  const data       = useMemo(() => [...store.current.data.values()],       [revision]);
  const links      = useMemo(() => [...store.current.links.values()],       [revision]);

  return (
    <AnnotationContext value={{
      geometries, data, links, realtimeState,
      isLoadingAdditionalData, loadProjectData,
      updateGeometry, createAnnotation,
      /* updateData, markLinkErasable, markLinkNonErasable */
    }}>
      {children}
    </AnnotationContext>
  );
}
```

The context surface exposed to consumers is intentionally narrow: read views (`geometries`, `data`, `links`), write operations, one on-demand loader (`loadProjectData`), and status flags (`realtimeState`, `isLoadingAdditionalData`). All synchronization, conflict handling, and reconnection logic is internal — no coordination is required from the caller.

This replaces the current `AnnotationContext` (based on `ViewerAnnotation` and the legacy scene-description PUT endpoint). The `AnnotationService` class becomes redundant and can be removed once migration is complete.

### 8. Module Architecture — Pure TypeScript Core + React Adapter

The synchronization logic described in the previous sections must not live inside React hooks. Hooks tie the code to the React lifecycle and make it impossible to use the same logic from a Node.js test client, an OpenLime editor, or a headless integration test.

The correct split is:

```
frontend/src/services/
  AnnotationApiClient.ts       ← already exists (REST + SSE)
  AnnotationEventsService.ts   ← already exists (SSE transport)

frontend/src/stores/
  AnnotationStore.ts           ← NEW: pure TypeScript class, no React dependency

frontend/src/context/
  AnnotationContext.tsx        ← NEW: thin React adapter (~50 lines)
```

#### `AnnotationStore` — pure TypeScript class

Owns all synchronization logic: the three Maps, the generation counter, `isSaving`, `isCreating`, `AnnotationStoreMeta`, and every method described in §2–§6. Communicates results to the outside world through five callbacks that the caller provides at construction time:

```typescript
interface AnnotationStoreCallbacks {
  onUpdate: () => void;                                        // store changed — caller re-renders or reprints
  onRealtimeStateChange: (state: AnnotationRealtimeState) => void; // SSE connection state changed
  onConflict: (id: string) => void;                           // 409: entity id, work was lost
  onError: (err: unknown) => void;                            // network error on write
  onEditsCancelled: () => void;                               // reconnect discarded in-flight saves
}

class AnnotationStore {
  constructor(
    private readonly client: AnnotationApiClient,
    private readonly callbacks: AnnotationStoreCallbacks,
  ) {}

  // ── read ──────────────────────────────────────────────────
  get geometries(): AnnotationGeometry[] { ... }
  get data(): AnnotationData[] { ... }
  get links(): AnnotationLink[] { ... }
  get realtimeState(): AnnotationRealtimeState { ... }  // reflects SSE connection state
  get isLoadingAdditionalData(): boolean { ... }        // true while loadProjectData fetch is in flight

  // ── lifecycle ─────────────────────────────────────────────
  async init(): Promise<void> { ... }   // load bundle → connect SSE
  destroy(): void { ... }              // disconnect SSE, increment generation

  // ── writes ────────────────────────────────────────────────
  async updateGeometry(id: string, shapes: AnnotationShape[]): Promise<void> { ... }
  async updateData(id: string, input: UpdateDataInput): Promise<void> { ... }
  async createAnnotation(input: CreateAnnotationInput): Promise<void> { ... }
  async markLinkErasable(id: string, expectedVersion: number): Promise<void> { ... }
  async markLinkNonErasable(id: string, expectedVersion: number): Promise<void> { ... }

  // ── on-demand loader ──────────────────────────────────────
  async loadProjectData(): Promise<void> { ... }
}
```

`onUpdate` is the only bridge to the outside world for state changes. The caller decides what to do with it — re-render a React tree, reprint a terminal table, or update a canvas.

#### `AnnotationContext` — thin React adapter

Creates an `AnnotationStore` instance in a `useRef`, wires `onUpdate` to a `useState` bump, and exposes the store's public surface via context. No synchronization logic lives here.

```typescript
export function AnnotationProvider({ projectId, sceneId, children }) {
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(r => r + 1), []);

  const storeRef = useRef<AnnotationStore | null>(null);

  useEffect(() => {
    const client = new AnnotationApiClient({ projectId, sceneId });
    const store = new AnnotationStore(client, {
      onUpdate:                bump,
      onRealtimeStateChange:   setRealtimeState,
      onConflict:              (id) => { /* show toast */ },
      onError:                 (err) => { /* show toast */ },
      onEditsCancelled:        () => { /* show toast */ },
    });
    storeRef.current = store;
    void store.init();
    return () => { storeRef.current = null; store.destroy(); };
  }, [projectId, sceneId]);

  const store = storeRef.current;
  const geometries = useMemo(() => store?.geometries ?? [], [revision]);
  const data       = useMemo(() => store?.data       ?? [], [revision]);
  const links      = useMemo(() => store?.links      ?? [], [revision]);

  return (
    <AnnotationContext value={{
      geometries, data, links,
      realtimeState,
      isLoadingAdditionalData: store?.isLoadingAdditionalData ?? false,
      store,
    }}>
      {children}
    </AnnotationContext>
  );
}
```

#### Node.js test client (§13 scenarios)

The same `AnnotationStore` class is usable directly without React:

```typescript
const client = new AnnotationApiClient({ projectId, sceneId });
const store = new AnnotationStore(client, {
  onUpdate:         () => printStore(store),
  onConflict:       (id) => console.log(`conflict on ${id} — work lost`),
  onError:          (err) => console.error('write error', err),
  onEditsCancelled: () => console.log('reconnect: in-flight saves discarded'),
});

await store.init();
await store.createAnnotation({ shapes: [...], label: 'test', class: null, content: {} });
// → printStore fires, shows updated local DB
```

This covers the three test scenarios from §13 without any browser or DOM dependency:

| Scenario | What to verify |
|---|---|
| Single client | `init()` populates store; write persists to MongoDB; `onUpdate` fires |
| Multi-client, no conflict | Concurrent writes to different entities; all clients converge to same final state via SSE |
| Multi-client, conflict | Two clients write same entity; first succeeds; second gets `onConflict`; both stores end up with winner's version |

### 9. Backend Prerequisites

Before the on-demand data loading feature can be used, the backend must provide or expose the following capability:

* `GET /api/projects/:projectId/annotations/data` — returns all `annotationData` for the project without a `sceneId` filter. Must support the `includeErasable` query parameter consistent with the existing collection endpoints.

### 10. Summary of Data-Flow Invariants

1. **SSE is opened only after the store is populated.** The sequential load-then-connect order guarantees no SSE event can arrive before there is a consistent baseline in the store.
2. **The version guard prevents store regression.** Both the SSE handler and the write commit path write to the store only if the incoming version is ≥ the current store version, making all concurrent async completions idempotent regardless of arrival order.
3. **Generation guards all async operations.** Any result from before a scene change or reconnection is silently discarded. The store is never left in a mixed state from two different scopes.
4. **Double-submit is prevented.** The `isSaving` guard returns early if a write for that entity is already in flight.
5. **Conflict resolution is first-commit-wins via OCC.** A 409 means another user's write reached the server first. The loser is notified, the winner's version is fetched and stored, and there is no merge dialog.
6. **Reconnection is a clean slate.** In-flight saves are discarded (user notified if any were active), and the store is rebuilt from the authoritative scene bundle.
7. **The data store is a monotonically growing superset of the scene bundle.** Data entities are never evicted except on reconnect reset or scene change. SSE-delivered data mutations are inserted unconditionally for scene-scoped streams (where server-side filtering already guarantees relevance); project-wide streams would require an explicit relevance check.
