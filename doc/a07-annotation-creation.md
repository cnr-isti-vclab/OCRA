# Annotation Creation and Visualization

Guided creation and link-aware visualization for OCRA’s decomposed annotation model (geometry, data, link).

## Status and scope

| Milestone | Scope | Status |
| --------- | ----- | ------ |
| M1 | Link view modes (Show all / By geometry / By data) | **Done** |
| M2 | Draft store + expandable Create setup form | **Done** |
| M3 | Geometry step (viewer), data step (panel), wizard-only creation (no immediate `createAnnotation`) | **Done** |
| M4 | Polish, edge cases, UX completeness | **Done** |
| M5 | Tests, docs sync, hardening | **Done** |

- **Implemented in the app** (M1–M5): see module list and testing section below.
- **Related docs**:
  - `doc/annotation-current-status.md` — broader annotation feature status
  - `doc/a06-active-annotations.md` — active vs focus mental model
  - `doc/a00-annotation-model.md` — canonical model semantics

### Behaviour summary (as implemented)

- **Draft until Done**: geometry/data drafts stay client-side until the data-step **Done**. Commit uses existing REST endpoints sequentially (no monolithic API, no transactions, no OCC on create).
- **Entry**: opens on the **geometry** step (2D workbench or panel Create). Scope/visibility pickers remain; there is no New/Search/Void setup matrix.
- **Per step — New | Choose | Done**:
  - **New**: sticky create (append geometries / confirm data into arrays). **Undo** drops the last created item. **Choose** is disabled once any creations exist on that side.
  - **Choose**: select existing entities (multi-select when the other side has at most one result).
  - **Done**: always advances geometry (including N=0 → data-only). On data, commits when guards pass.
- **Cardinality**: star topology only — `N===0 || K===0 || N===1 || K===1`. Geometry-only requires data mode unset; entering New/Choose on data requires at least one data result.
- **Geometry step**:
  - **New (2D)**: native OpenLIME annotations; sticky draw appends to `createdGeometries`.
  - **New (3D)**: point picking; drafts synced from the store.
  - **Choose**: viewer/workbench selection → `selectedGeometryIds`.
- **Data step**:
  - **New**: modal → confirm appends to `createdData[]`.
  - **Choose**: searchable list of project data.
- **Remembered scopes**: geometry/data scope + drawing tool remembered for the browser session (`sessionStorage` per project/scene when enabled).
- **Link view during wizard**: filtering is bypassed so draft/chosen geometries stay visible.
- **Commit failure**: partial artifacts are marked erasable (rollback); draft is restored for retry.
- **Not implemented**: order switch (data-first); localStorage draft recovery on refresh; 3D line/area creation; explicit connector lines in link view.

### Key modules

| Area | Path |
| ---- | ---- |
| Proposal / this doc | `doc/a07-annotation-creation.md` |
| Store | `frontend/src/stores/AnnotationStore.ts` |
| Scopes / action bar | `frontend/src/features/annotation-creation/AnnotationCreationPanel.tsx` |
| Geometry step UI | `frontend/src/features/annotation-creation/AnnotationCreationGeometryStep.tsx` |
| Data step UI | `frontend/src/features/annotation-creation/AnnotationCreationDataStep.tsx` |
| Validation | `frontend/src/features/annotation-creation/annotationCreationValidation.ts` |
| 2D workbench | `frontend/src/features/annotation-workbench/AnnotationWorkbench.tsx` |
| Link view | `frontend/src/features/annotation-link-view/` |
| 2D viewer wiring | `frontend/src/routes/components/Viewer2DPanel.tsx` |
| 3D viewer wiring | `frontend/src/routes/components/Viewer3DPanel.tsx` |
| Panel | `frontend/src/routes/components/AnnotationPanelEditor.tsx` |

### Testing

**Automated**

| Suite | Command | Coverage |
| ----- | ------- | -------- |
| Frontend unit + store | `npm run test:unit` | Validation, link view, toolbar mode, draft helpers, `commitCreationDraft` rollback/interrupt |
| Backend creation API | `npm run test:annotation-creation` | Sequential geometry/data/link create, link-only, version 0 on create, 409 on update OCC |

Key test files:

- `frontend/src/features/annotation-creation/*.test.ts`
- `frontend/src/features/annotation-link-view/annotationLinkViewMode.test.ts`
- `frontend/src/stores/AnnotationStore.creation.test.ts`
- `backend/src/test/annotation-creation.api.test.ts`

**Manual checklist** (2D unless noted)

- [ ] Multi-geometry New + one shared data → star links
- [ ] One geometry + multiple New data → star links
- [ ] Geometry-only: created geos, data mode unset, Done
- [ ] Data-only: geometry Done with N=0, New data, Done
- [ ] Choose geometries + Choose/New data (K≥1 required)
- [ ] Choose disabled after creations; re-enabled after Undo clears them
- [ ] 2D: point / line / area sticky New → Undo last → Done → data
- [ ] 3D: point create → data step → Done
- [ ] Data modal Cancel with empty list clears New mode (geometry-only Done stays available)
- [ ] Back / discard at each wizard step
- [ ] Scopes remembered across repeated Annotate/Create opens
- [ ] Commit failure shows error; partial artifacts not left active
- [ ] Link view modes during wizard do not hide draft/chosen geometry
- [ ] Regression: normal (non-wizard) annotation edit in 2D/3D when wizard inactive

---

## Annotation connection (link) visualization

To show connections between data and geometries we explicitly display only the linked items, without rendering line connections between geometry and data.

The basic idea is to select between three annotation rendering modes:

- `SHOW ALL`: show all geometries in the viewer and all data in the panel (no explicit connections are visible)
- `SELECT GEOMETRY`: when a geometry is selected in the viewer, the corresponding annotation data are displayed in the panel
- `SELECT DATA`: when an annotation data item is selected in the panel, the corresponding geometries are displayed in the viewer

On multiple selection, labels on geometries help user to identify the connections between geometries and data. 

## Annotation Creation



### Interface

Batch creation uses progressive **New | Choose | Done** on each side (never a pre-wizard New/Search/Void matrix).

| GEO | DATA |
| --- | ---- |
| Scope (type + id) | Visibility (type + id) |
| New (sticky draw) / Choose / Done | New (modal → list) / Choose / Done |
| Undo last created | Undo last created |
| Back / Cancel | Back / Cancel |

**Rules**

- Modes are exclusive per side: created XOR chosen (no mix).
- Choose is disabled once any item was created on that side (Undo to re-enable).
- Star links only: at most one side may have count &gt; 1.
- Geometry Done with N=0 → data-only (New required).
- Geometry-only → leave data mode unset and press Done.
- Chosen geometries require K≥1 data before Done.

### Procedure

#### Geometry

- Wizard opens on the geometry step (workbench Annotate, or panel Create).
- **New**: draw in the viewer; each completed shape appends; stay in draw mode; **Undo** removes the last.
- **Choose**: select existing geometries (viewer and/or workbench list).
- **Done** always advances to data (including skip with N=0).
- **Back** discards the session (confirm modal).

#### Data

- **New**: open the data modal; **Add data** appends to the created list; repeat while allowed.
- **Choose**: search/select existing data (multi only when ≤1 geometry).
- **Done** commits when validation passes (create geometries → data → link pairs).
- Cancel on an empty New modal clears data mode so geometry-only Done remains available.



### Interface Integration

**2D**: Annotate opens the creation workbench beside the viewer (geometry + data steps).  
**3D / panel**: Create expands scopes in the annotation panel; geometry and data step UIs render in the panel body while the list is hidden.

On Done, sequential REST calls persist new geometries/data and create link pairs. Drafts are not written until then.

### Database Update

On confirm, the remote database is updated via sequential REST calls. Until then, geometry and data edits/selections remain client-side drafts and are not persisted.

What is written

- Geometry-only: insert a document into the `annotation_geometry` collection with `projectId`, `shapes`, `referenceType`, `referenceId`, audit fields, soft-delete fields (`erasableAt`, `erasableBy`), and `version` (**starts at 0**).
- Data-only: insert a document into the `annotation_data` collection with `projectId`, `label`, `description`, `class`, `content`, `visibilityType`, `visibilityId`, audit fields, soft-delete fields (`erasableAt`, `erasableBy`), and `version` (**starts at 0**).
- Geometry + Data + Link: create geometry and/or data documents as above (only for new items), then create a link document in `annotation_link` that stores the `projectId`, `geometryId`, `dataId`, audit fields, soft-delete fields (`erasableAt`, `erasableBy`) and `version` (**starts at 0**). If the user selected existing geometries/data via search, only the missing documents are created and then a link document is created.

Collections & schemas

- See the canonical Zod/TypeScript schemas in [shared/annotation-schema.ts](shared/annotation-schema.ts) for the exact fields and types.
- Persisted collections: `annotation_geometry`, `annotation_data`, `annotation_link` (MongoDB collections; repository code is under `backend/src/repositories/`).

Atomicity and transactions

- Transactions are **not required** for this proposal. The backend already supports creating geometry/data/link independently, and the UI flow can commit them sequentially on confirm.
- If the confirm step creates multiple documents and a later call fails, the client should handle the error and (optionally) offer a “cleanup” action that marks newly-created entities erasable.

Optimistic Concurrency Control (OCC)

- OCC is **not needed for creation**.
- OCC remains relevant for **updates** of existing geometry/data/link documents (outside the scope of this creation flow), where the API uses `expectedVersion` and returns HTTP 409 on conflicts.

API surface (current backend)

The current backend API is split per entity (project-scoped):

- POST `/api/projects/{projectId}/annotations/geometry`
- POST `/api/projects/{projectId}/annotations/data`
- POST `/api/projects/{projectId}/annotations/links`

This proposal can be implemented on top of those three endpoints (no monolithic endpoint required).

Example payloads

Geometry-only (new geometry, no data) — `POST /api/projects/{projectId}/annotations/geometry`:

```json
{
  "referenceType": "scene",
  "referenceId": "<sceneId>",
  "shapes": [{ "type": "ShapePolygon", "vertices": [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }]
}
```

Data-only (new data, no geometry) — `POST /api/projects/{projectId}/annotations/data`:

```json
{
  "label": "Fragment description",
  "description": "",
  "class": null,
  "content": { "terms": ["vocab:1"] },
  "visibilityType": "asset",
  "visibilityId": "<assetId>"
}
```

Geometry + Data + Link (both new) — sequence:

1. create geometry (POST geometry)
2. create data (POST data)
3. create link (POST links)

```json
{
  "geometry": {
    "referenceType": "scene",
    "referenceId": "<sceneId>",
    "shapes": [{ "type": "ShapePolygon", "vertices": [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }]
  },
  "data": {
    "label": "Description text",
    "description": "",
    "class": null,
    "content": {},
    "visibilityType": "scene",
    "visibilityId": "<sceneId>"
  }
}
```

Then link — `POST /api/projects/{projectId}/annotations/links`:

```json
{
  "geometryId": "<geometryId>",
  "dataId": "<dataId>"
}
```

Linking existing items (search + link) — create one link per pair:

```json
{
  "geometryId": "<geometryId>",
  "dataId": "<dataId>"
}
```

Server responses

- Success: `201 Created` with the created resource IDs and minimal created documents.
- Validation error: `400 Bad Request` with field errors.
- Concurrency conflict (OCC): `409 Conflict` (relevant for updates, not creation).

Audit and events

- On successful persist, broadcast an annotation mutation event via the existing event bus (`backend/src/lib/annotation-events.ts`) so frontends watching the scene/project receive the update in real time.

Error handling and UX

- The client should display progress and clear success/failure messages. For `409` responses show a conflict resolution prompt allowing the user to refresh server state or attempt a merge.
- Retries: for transient DB/network errors, implement a small retry with exponential backoff client-side.

Testing

- Add integration tests covering: geometry-only creation, data-only creation, geometry+data+link creation (sequential commit), linking existing items, and 409 conflict handling for updates. Use the project test setup that runs Postgres/Mongo (see `backend/src/test/setup.ts`).

Notes for implementers

- Refer to [shared/annotation-schema.ts](shared/annotation-schema.ts) for canonical field names and types.
- For backend repository implementations, check `backend/src/repositories/annotation-*.repository.ts` for existing helpers and follow repository patterns for indexing and unique constraints.

Implementation guidance and improvement areas

- Local drafts: preserve user work during long creation sessions by keeping the draft state on the client, either in local storage or in an ephemeral draft object. This avoids data loss if the browser is refreshed or if a long annotation creation is interrupted.
- Conflict resolution UX: define how the client handles `409 Conflict`. Present a concise conflict modal that shows the current server state and allows the user to refresh, overwrite, or merge changes. This is particularly important for collaborative annotation editing.
- API validation: standardize the create endpoint contract with JSON schema validation on the server. Reject malformed or incomplete requests with clear field-level errors.
- ID strategy: ids are generated server-side today. If the UI implements retries across the confirm step, ensure the UX avoids accidental duplicate creates (e.g. disable confirm while saving, show a single retry action, and rely on the unique index for link pairs).
- Indexes and performance: recommend indexes on `referenceType + referenceId`, `geometryId`, `dataId`, and any soft-delete fields used for cleanup. For large result sets, paginate search responses and avoid loading all candidate annotations at once.
- Soft-delete and garbage collection: define how void or unlinked documents are handled. Use `erasableAt`/`erasableBy` consistently and consider a periodic cleanup job for orphaned geometries or data that are no longer linked.
- Visualization enhancements: optionally support an explicit connector toggle in complex scenes so users can switch between “high-level linked view” and “explicit connector view”. Include hover highlighting and keyboard accessibility for linked selections.
- Testing: expand coverage with integration tests for non-transactional reconciliation, OCC conflict handling, link creation from existing items, and UI flow cases for geometry-only, data-only, and full annotation creation.

This completes the database/update guidance for the annotation creation flow. The UI text and modal copy should mirror the operation semantics described above (confirm = persist; back = cancel draft). 