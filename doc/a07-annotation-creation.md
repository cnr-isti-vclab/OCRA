# Annotation Creation and Visualization

Guided creation and link-aware visualization for OCRA’s decomposed annotation model (geometry, data, link).

## Status and scope

| Milestone | Scope | Status |
| --------- | ----- | ------ |
| M1 | Link view modes (Show all / By geometry / By data) | **Done** |
| M2 | Draft store + expandable Create setup form | **Done** |
| M3 | Geometry step (viewer), data step (panel), block immediate `createAnnotation` | **Done** |
| M4 | Polish, edge cases, UX completeness | **Done** |
| M5 | Tests, docs sync, hardening | **Done** |

- **Implemented in the app** (M1–M5): see module list and testing section below.
- **Related docs**:
  - `doc/annotation-current-status.md` — broader annotation feature status
  - `doc/a06-active-annotations.md` — active vs focus mental model
  - `doc/a00-annotation-model.md` — canonical model semantics

### Behaviour summary (as implemented)

- **Draft until confirm**: geometry/data selections and new shapes stay client-side until the final confirm (`Next` / `Confirm`). Commit uses existing REST endpoints sequentially (no monolithic API, no transactions, no OCC on create).
- **Setup form**: per-side choice New / Search / Void, scope pickers, multi-side rule when both sides search. Choices are **remembered in-memory** for the current browser session only (not persisted to the server or `localStorage`/`sessionStorage`).
- **Geometry step** (viewer):
  - **New (2D)**: native OpenLIME annotation kept via `draftGeometryViewerId`; shapes flushed into the draft before advance.
  - **New (3D)**: point picking only; draft rendered from store (`creation-draft` id).
  - **Search**: viewer selection → `selectedGeometryIds` (scoped, respects multi-side rule).
  - Immediate `createAnnotation` is blocked while the wizard is active (except new-geometry capture).
- **Data step** (panel):
  - **New**: `AnnotationDataFormModal`.
  - **Search**: toggle list with project data load.
- **Void paths**: geometry void → data-only; data void → geometry-only after geometry step; both search → link-only.
- **Link view during wizard**: filtering is bypassed so draft/search geometries are not hidden.
- **Commit failure**: partial artifacts are marked erasable (rollback); user sees an error message in the creation panel.
- **Not implemented**: localStorage draft recovery on refresh; 3D line/area creation; explicit connector lines in link view.

### Key modules

| Area | Path |
| ---- | ---- |
| Proposal / this doc | `doc/a07-annotation-creation.md` |
| Store | `frontend/src/stores/AnnotationStore.ts` |
| Setup UI | `frontend/src/features/annotation-creation/AnnotationCreationPanel.tsx` |
| Validation | `frontend/src/features/annotation-creation/annotationCreationValidation.ts` |
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

- [ ] All 9 geometry×data choice mixes (new/search/void combinations that are valid)
- [ ] 2D: point / line / area create → edit vertices → Next → data → Confirm
- [ ] 2D: redraw geometry replaces draft; Confirm persists final shape only
- [ ] 3D: point create → edit/drag → data step → Confirm
- [ ] 3D: second point pick replaces draft
- [ ] Search: multi-select on configured side only (both-side search + multi-side radio)
- [ ] Data modal Cancel → discard confirm; Keep editing stays in modal
- [ ] Back / data-modal discard at each wizard step
- [ ] Setup choices remembered in-memory across repeated Create opens (same page session)
- [ ] Commit failure shows error; partial artifacts not left active in panel
- [ ] Link view modes during wizard do not hide draft/search geometry
- [ ] Regression: normal (non-wizard) annotation create/edit in 2D/3D when wizard inactive

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

The proposed interface should be flexible to let users create an annotation and connect geometry and data.
Both geometry and data must reference a scene or a selected asset.
Geometry and data can be created, searched in the database, or one can be left void (only the other is created).


| GEO              | DATA             |
| ---------------- | ---------------- |
| Ref. Type , id   | Ref. Type , Id   |
| - New            | - New            |
| - Search - Multi | - Search - Multi |
| - Void           | - Void           |
| `CREATE`         |                  |
| `BACK`           | `NEXT`           |


The interface lets the user choose for both geometry and data whether it is new, searched, or void (one radio group for gemetry and one for data) .If the search option is used, one or more entries can be selected. 

If both geometry and data are searched, only one side may support multiple selection.  
Use the Multi Radio selection among the two search (enabled when both search are selected)) to identify the ones that support multiple selection.  
Once options are selected, the creation procedure begins.

### Procedure



#### Geometry

- Before pressing `CREATE`, the `BACK` and `NEXT` buttons are disabled.
- Press `CREATE` to start the creation procedure.
- `BACK` and `NEXT` become enabled.
- The annotation creation procedure starts from the Geometry step.
- Geometry creation and search are performed in the viewer.
- If geometry is new, it is created and may be modified to obtain the desired shape.
- If geometry is searched, one or more geometries are selected (if multiple selection is enabled).
- Once the geometry step is finished, the user presses `NEXT` to move to the Data step. If the user presses `BACK`, the operation is aborted and a modal warns the user to confirm discarding work.
- If Data is selected as void, the annotation creation ends after pressing `NEXT`. Only geometry is created; no data or link are created.



#### Data

- If geometry was selected as void, creation starts at the Data step. Only data is created; no geometry or link is created.
- If 'new data' is selected, a modal opens to create annotation data. The modal window used for updating annotation data could be reused.
- If 'search' is selected for data, the user can search among existing annotations.
- Search results are shown in the annotation list.
- Annotation data cards, instead of showing erase/edit buttons, show a toggle button indicating selection. Toggles are initially off. This allows users to perform multiple searches while accumulating selections; simple click selection is not sufficient because the user may refine searches before finalizing selection.
- Once the user finishes selection they can press `NEXT` to complete creation, or `BACK` to return to the previous step.



### Interface Integration

Here the description of how the previous GUI should be inserted.  In the annotation panel, after the heading, there will be a toggle button corresponding to an expandable `Create` section.
On create pressed, the section  containing the creation user interface will be expanded. When starting the creation, there are no annotation displayed in the annotation list. The list will be used onlòy to show annotation data as the result of a user search, or the created annotation data. 

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