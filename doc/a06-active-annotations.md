# Active annotations

The final OCRA interface will have to provide access to the annotation in their decoupled form:

- geometry: visible within the viewer
- data: visible in the AnnotationPanel
- link: coupling previous entities, creating a complete annotation

There are situations where exist geometries or data that are not linked yet. 
One geometry could be linked to multiple data (with multiple links), or one data could be linked to multiple geometries.

The AnnotationStore keeps a local copy in sync with the remote database of the annotations of the current scene.
The application can filter annotations depending on user selected criteria, in order to have access to a restricted set of active annotations
There is a query system which allows the user to select the active annoations from the annotationStore.
All the visualization and editing operations will be performed on the active annotations.

## **Mental model**


| **Entity**   | **Typical role in UI**                                                   |
| ------------ | ------------------------------------------------------------------------ |
| **Geometry** | What the **viewer** draws (shapes, e.g. rust regions from segmentation)  |
| **Data**     | What the **panel** lists and edits (label, class, vocabulary, semantics) |
| **Link**     | Optional many-to-many join; not required for something to be “active”    |


So:

- **Viewer** → active **geometries** (linked or not).
- **Panel** → active **data** (linked or not).
- **Links** → shown as relationships (counts, badges, link/unlink actions), not as the only list rows.

That matches “N geometries → one rust data” and “one geometry → N data descriptions” without forcing a fake “annotation = link” everywhere.

## **Active selection: three sets + derived indexes**

Use **three independent active ID sets** as the result of `selectActiveAnnotations(criteria)` — not three sets you hand-edit in the GUI, but **outputs of one evaluator**:

```typescript
interface ActiveAnnotationSelection {

geometryIds: ReadonlySet;

dataIds: ReadonlySet;

linkIds: ReadonlySet;

*// Materialized views (from store maps ∩ ids)*

geometriesById: ReadonlyMap<string, AnnotationGeometry>;

dataById: ReadonlyMap<string, AnnotationData>;

linksById: ReadonlyMap<string, AnnotationLink>;

*// Relationship indexes (for panel/viewer without rescanning)*

linksByGeometryId: ReadonlyMap<string, AnnotationLink[]>;

linksByDataId: ReadonlyMap<string, AnnotationLink[]>;

geometryIdsByDataId: ReadonlyMap<string, string[]>;

dataIdsByGeometryId: ReadonlyMap<string, string[]>;

}
```

**Canonical rule:** criteria define predicates per kind; evaluation fills the three sets. Optionally, **link set** is:

- **Independent** — `link` predicate only, or
- **Derived** — e.g. “all links whose `geometryId` ∈ activeGeometryIds and/or `dataId` ∈ activeDataIds” (configurable in `SelectionCriteria`).

For geometry segmentation + rust annotation data example:

1. Criteria: `geometry` = “from segmentation import” / spatial / id list.
2. User links many geometries to one `data` (“rust”).
3. Active: many `geometryIds`, one `dataId`, many `linkIds`.
4. Viewer: all active geometries. Panel: that one data row + “linked to N geometries”.

For one geometry, N data:

1. Active: one `geometryId`, N `dataIds`, N `linkIds`.
2. Viewer: one shape. Panel: N data rows (each editable).
3. Viewer labels: policy needed when multiple data link to same geometry (see below).

**Unlinked** entities are first-class:

- `geometryIds` can include geometries with **no** link.
- `dataIds` can include data with **no** link.
- `linkIds` may be empty for those rows.

Predicates can express that explicitly, e.g. `linkPresence: 'any' | 'linked' | 'unlinked'` on geometry/data filters.

## `SelectionCriteria` **(declarative, GUI-ready)**

```typescript
interface SelectionCriteria {

geometry?: GeometryPredicate;

data?: DataPredicate;

link?: LinkPredicate;

includeErasable?: boolean;

*/***
   ** How links enter activeLinkIds when link predicate is omitted.*
   ** - independent: only link predicate (if any)*
   ** - anyEndpoint: link active if geometryId OR dataId is active*
   ** - bothEndpoints: link active only if both endpoints active*
   **/*

linkMode?: 'independent' | 'anyEndpoint' | 'bothEndpoints';

}
```

Future query UI only edits this object; store re-runs evaluation on `onUpdate`.

Default: `{}` → all entities currently in the store (scene bundle + merged project data), same as today’s “show everything loaded”.

## **Updates: one data, many “annotations”**

You do **not** need N panel rows or N writes. In the decoupled model:

- There is **one** `AnnotationData` document.
- **Many** links point at it.
- **One** `updateData(dataId, …)` updates Mongo once.
- SSE emits `data.updated` (or `data.erasable`, etc.).
- Store applies it once in `dataMap`.
- Every viewer that draws a geometry linked to that `dataId` re-reads the same datum (via `linksByGeometryId` / `dataIdsByGeometryId`).

So “all annotations referencing that data should be updated” is already the correct backend semantics; the UI should present it as **editing one data entity** that **N geometries reference**, not N duplicate edits.

Panel copy helps: e.g. “Rust (linked to 12 geometries)”.

## **Viewer vs panel responsibilities**

**Viewer (active geometries)**

- Input: `activeSelection.geometriesById` (or `geometryIds` + store).
- Draw every active shape, whether or not linked.
- **Label / semantics:** resolved in an **adapter layer** (not inside the store). For each active `geometryId`, build a payload and pass it to the viewer:
  - 0 linked data → `labels: []`, `selected: []` (viewer draws shape only).
  - 1 linked data → `labels: [datum.label]`, `selected: [true]` (or reflect panel focus).
  - N linked data → `labels: string[]` (one entry per linked `AnnotationData.label`), `selected: boolean[]` (parallel array, same length).
- **Viewer API:** expose something like `setGeometryLabels(geometryId, { labels, selected })` (exact name per 3D/2D adapter). The **viewer** decides what to render (e.g. all selected labels, first selected only, stacked billboards, comma-separated). OCRA does not hard-code print policy in the store.
- `**selected[]` meaning:** typically driven by **panel focus / UI selection** (e.g. user focused one data row → that data’s index is `true`; multi-select in panel → multiple `true`). Query filter (`SelectionCriteria`) only controls *which* geometries/data are active, not which label is emphasized.

**Panel (active data)**

- Input: `activeSelection.dataById` as the **primary list**.
- Each row: data fields + badge `linked to k geometries` / `unlinked`.
- Actions: edit data, mark erasable, **link to geometry** / **unlink**, open geometry list for that data.
- Optional secondary list/tab: “Active geometries” for segmentation workflow (or rely on viewer selection).

You can still expose `activeSelection.linksById` for a future “Links” tab or power users, but day-to-day is geometry-in-viewer + data-in-panel.


| **Idea**                                                           | **Role**                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Full store maps for sync/SSE                                       | Full scene-visible copy (sync, writes, SSE)                         |
| `SelectionCriteria` + `selectActiveAnnotations(criteria)` on store | Declarative query (for the future GUI)                              |
| React exposes **active** views, not only raw maps                  | Access only to selected annotations entries                         |
| `ResolvedAnnotation[]` as **only** panel API                       | **Optional** — helper for “fully linked triples”, not the main list |


Add helpers without making them the only API:

```typescript
*// Fully linked triples where both endpoints are active (and link active)*

getActiveResolvedTriples(selection): ResolvedAnnotation[]

*// For a data row in the panel*

getGeometriesForActiveData(dataId): AnnotationGeometry[]
```

## **UI selection vs query filter**

Keep two layers:


| **Layer**                                                           | **Purpose**                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Active** (`SelectionCriteria`)                                    | Query/filter — what’s visible in viewer + panel                    |
| **Focus** (`focusedGeometryId`, `focusedDataId`, multi-select sets) | What the user clicked — drives highlight, editor lock, detail pane |


Example: criteria show all “rust” data; user focuses one data row → viewer highlights all geometries linked to that data (`geometryIdsByDataId`).

## **Summary**

1. **Active = three evaluated sets** (geometry, data, link) + **relationship indexes**.
2. **Viewer = active geometries**; **panel = active data**; links are relational glue.
3. **Unlinked** geometry/data are normal members of active sets.
4. **Update data once** → all linked geometries see the same semantic update via store + SSE (no N writes).
5. `ResolvedAnnotation` remains a convenience for linked triples, not the primary abstraction.

## Multi-label viewer contract (decided)

When one geometry links to N data records, the **store** does not choose a single label. An adapter builds parallel arrays; the **viewer** decides how to draw them.

```typescript
/** Per-geometry label input for 3D/2D viewers. `labels` and `selected` must have the same length. */
interface GeometryLabelDisplay {
  labels: string[];
  selected: boolean[];
}

// Per viewer adapter (names may differ for Three.js vs OpenLIME)
setGeometryLabels(geometryId: string, display: GeometryLabelDisplay): void;
```

**Adapter (OCRA)** — on store / selection / focus change, for each active geometry:

1. `dataIds = activeSelection.dataIdsByGeometryId.get(geometryId) ?? []`
2. `labels = dataIds.map(id => activeSelection.dataById.get(id)?.label ?? '')`
3. `selected = dataIds.map(id => focusState.isDataSelected(id))` (e.g. panel-focused row, multi-select)

**Viewer** — rendering policy only, e.g. show all `selected[i]` labels, first selected, comma-joined, or stacked billboards.

**Cases:** 

- 0 data → empty arrays; 
- 1 data → one label, `selected` from focus; 
- N data → full arrays. Unlinked geometries still render shapes with empty label arrays.

Building selected: when the user focuses a data row in the panel, set true for that data s index on every geometry linked to it (dataIdsByGeometryId). Multi-select in the panel → multiple true. No link → labels: [], selected: []; shape still draws.

Updates: one updateData changes one label string; adapter rebuilds arrays for all geometries that reference that dataId; viewer refreshes.

This keeps N-data-per-geometry and N-geometry-per-data flexible without baking print rules into AnnotationStore.

## New selection module

frontend/src/stores/annotation-selection.ts

- SelectionCriteria — declarative filters per entity kind
  - geometry, data, link predicates (ids, scope, label/class, erasable, linkPresence: 'any' | 'linked' | 'unlinked', optional custom)
  - includeErasable (default true)
  - linkMode: 'independent' | 'anyEndpoint' | 'bothEndpoints' (default 'bothEndpoints')
- ActiveAnnotationSelection — three ID sets plus materialized maps and relationship indexes (linksByGeometryId, dataIdsByGeometryId, etc.)
evaluateActiveSelection(maps, sceneId, criteria) — pure evaluator
- Helpers: getActiveResolvedTriples, getActiveGeometriesForData, buildGeometryLabelDisplay (for step 2 viewers)

