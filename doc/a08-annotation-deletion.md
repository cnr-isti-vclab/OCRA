# Annotation Deletion Proposal

Guided soft-delete (mark erasable) for OCRA’s decomposed annotation model (geometry, data, link). Symmetric to the creation wizard in `doc/a07-annotation-creation.md`.

## Status and scope

| Milestone | Scope | Status |
| --------- | ----- | ------ |
| M1 | Remove card/bulk triplet delete; expandable Delete setup | **Planned** |
| M2 | Selection phase + link view integration | **Planned** |
| M3 | One-to-many disambiguation modals | **Planned** |
| M4 | Sequential commit, OCC, rollback | **Planned** |
| M5 | Tests, docs sync, hardening | **Planned** |

- **Replaces**: per-card delete and bulk delete on annotation data rows (`markAnnotationTripletErasable` in `AnnotationPanelEditor.tsx`).
- **Related docs**:
  - `doc/a00-annotation-model.md` — weak/strong lifecycle, no primitive cascades
  - `doc/a07-annotation-creation.md` — wizard pattern, link view modes, commit rollback
  - `doc/a01-collaborative-annotation-editing.md` — OCC, social locks
  - `doc/a06-active-annotations.md` — active vs focus mental model

### Behaviour summary (target)

- **Draft until confirm**: delete intent and selected candidates stay client-side until `Confirm delete`. Commit marks entities **erasable** via existing REST `PATCH …/erasable` endpoints (sequential, no monolithic API, no server transaction).
- **Soft delete only**: entities leave the default **active** set (`erasableAt` set); physical cleanup is a separate maintenance/structuring concern (`a00`).
- **No restore UI in v1**: undelete (`nonerasable`) may be added later; out of scope for this proposal.
- **Social locks**: entities under another user’s **editor** social lock cannot be added to the delete basket and cannot be committed.
- **Endpoint rule**: geometry or data cannot be committed for erasable marking unless **every non-erasable link** attached to that endpoint is included in the basket (auto-included when Link is checked alongside Geometry/Data).

### Non-goals (v1)

- Physical purge of weak entities
- Restore / undelete wizard
- New composite delete API on the backend (commit uses existing per-entity erasable endpoints)
- Deletion from OpenLIME viewer context menus (panel-driven wizard only)

---

## UI

### Entry point

Add a **Delete** button next to **Create** in the annotation panel (labels may be shortened to `Create` / `Delete` in annotation context).

The Delete button expands a setup section, mirroring the creation panel:

| Control | Purpose |
| ------- | ------- |
| Checkboxes: **Link** \| **Geometry** \| **Data** | What to mark erasable |
| **Start delete** | Enter selection phase (becomes **Back** to abort) |
| **Confirm delete** | Commit the delete basket (enabled when valid) |

After **Start delete**, the user selects candidates in the viewer and/or panel. **Confirm delete** runs the commit algorithm below.

### Delete intent matrix

| Link | Geometry | Data | Meaning |
| ---- | -------- | ---- | ------- |
| ✓ | — | — | Link-only: disconnect geometry and data; endpoints unchanged unless also selected |
| ✓ | ✓ | — | Remove selected geometries and their links to selected data (or all linked data if 1:N resolved) |
| ✓ | — | ✓ | Remove selected data and their links to selected geometries |
| ✓ | ✓ | ✓ | Full triplet removal for resolved link set |
| — | ✓ | — | **Invalid** — Geometry requires Link |
| — | — | ✓ | **Invalid** — Data requires Link |
| — | ✓ | ✓ | **Invalid** — both endpoints require Link |

**Auto-rule**: when **Geometry** or **Data** is checked, **Link** is automatically checked and cannot be unchecked. An endpoint cannot be marked erasable while any **non-erasable** link that references it remains outside the basket.

**Link-only** is valid: mark selected links erasable without marking endpoints.

---

## Selection phase

### Link view mode

Reuse annotation link view modes from `a07` (`showAll`, `selectGeometry`, `selectData`):

| User checks | Link view mode | Where user selects |
| ----------- | -------------- | ------------------ |
| Geometry (+ Link) | `selectGeometry` | Viewer — one or more geometries |
| Data (+ Link) | `selectData` | Panel — one or more data rows |
| Link only | `showAll` | Panel link list (or equivalent) — one or more links |

During the delete wizard, link-view filtering is **bypassed** for candidates already in the basket (same principle as creation wizard bypass), so partial selections are not hidden mid-flow.

### Delete basket

Client-side draft (conceptual shape):

```ts
deletionDraft: {
  step: 'setup' | 'selecting' | 'confirming' | 'committing';
  deleteLink: boolean;
  deleteGeometry: boolean;
  deleteData: boolean;
  candidateLinkIds: string[];
  candidateGeometryIds: string[];
  candidateDataIds: string[];
}
```

**Confirm delete** is enabled only when:

1. At least one candidate exists in the basket.
2. Every one-to-many selection has been resolved (see below).
3. For every geometry/data in the basket, all attached non-erasable links are also in the basket (when endpoint delete is requested).
4. No candidate is blocked by a remote editor social lock.

### Social locks

Match current panel delete behaviour:

- **Selection**: cannot add geometry, data, or link to the basket if another user holds an **editor** social lock on that entity or on a linked entity that would be affected.
- **Commit**: re-check locks immediately before commit; abort with a clear message if a lock appeared after selection.

Presence locks are informational only; editor locks are blocking.

---

## One-to-many disambiguation

When selecting an endpoint would affect more than one link, the user must resolve cardinality before the item is fully added to the basket.

### Fan-out from geometry (1 geometry → N data)

Triggered when the user selects a geometry that has multiple non-erasable links.

**Modal (cases: Geometry + Link, or Link + Geometry + Data):**

> A one-to-many element is selected. Do you want to delete it? All incoming links will be removed.

| Action | Effect |
| ------ | ------ |
| **Yes, delete anyway** | Add all links (and linked data if Data is checked) to the basket per intent matrix |
| **Cancel** | Do not add this geometry; clear transient selection |

### Fan-out from data (1 data → N geometries)

Triggered when the user selects data linked to multiple geometries.

Same warning modal as above when only links are removed; when **Geometry** is also checked, use the **link resolution** flow below.

### Link resolution modal (Link + Geometry + Data, or ambiguous multi-link)

When one selected endpoint has multiple links and the user must choose which associations to remove:

**Prompt:** *A one-to-many element is selected. Select which links you want to delete.*

| Option | Effect |
| ------ | ------ |
| **All** | Add all relevant links (and endpoints per checkboxes) to the basket |
| **None** | Remove the current endpoint from the basket; discard transient selection |
| **Let me select** | Open a checklist of linked counterparts (data if geometry was selected; geometries if data was selected) |

**Let me select — data led, multiple geometries:**

1. Store current viewer/panel selection state.
2. Show a small modal: *Select the geometries to delete.*
3. In the viewer, show only geometries linked to the selected data (others hidden or de-emphasized).
4. User multi-selects geometries in the viewer.
5. **OK** — add chosen links (and geometry ids if Geometry checked) to the basket; restore prior view/selection.
6. **Cancel** — discard; nothing added.

**Let me select — geometry led, multiple data:**

Same pattern with a checklist of linked data rows in the modal (or panel list).

### Completion rule

Selection can continue while the basket contains only resolved 1:1 or explicitly resolved 1:N items. **Confirm delete** stays disabled until every basket entry satisfies the endpoint–link rule above.

---

## Commit: frontend and backend

### Terminology

- **Delete** in the UI means **mark erasable** (`erasableAt` / `erasableBy` set, `version` incremented).
- Primitive APIs act on **one document at a time**; no automatic cascade (`a00`).

### Commit order

Build the final delete set from the basket and checkboxes, then apply in this order (snapshot `expectedVersion` per entity at confirm time):

1. **Links** — `PATCH …/links/{linkId}/erasable` for each `candidateLinkIds`.
2. **Geometries** — only if `deleteGeometry` and geometry id is in basket **and** it has no remaining non-erasable links outside the basket.
3. **Data** — only if `deleteData` and data id is in basket **and** it has no remaining non-erasable links outside the basket.

If **Link** is unchecked, only link-only intent is invalid when geometry/data are also unchecked; link-only uses step 1 alone.

### OCC and server errors

Each erasable transition uses optimistic concurrency (`expectedVersion`). On failure:

| Condition | Behaviour |
| --------- | --------- |
| `409` version conflict | Stop commit; show refresh/retry message (same family as creation/edit) |
| `409` already erasable | Treat as success for that id or skip |
| Entity not found | Stop commit; suggest refresh |
| Other errors | Stop commit; show API message |

**Modified by someone else** is expressed as a **version conflict** on that entity’s erasable transition, not a separate rejection rule.

**Still linked by another non-erasable link** is prevented client-side: endpoint ids are not committed until all attached links are in the basket. The server does not need a special “linked by someone else” branch for v1.

### Frontend after commit

| Outcome | Behaviour |
| ------- | ----------- |
| **Full success** | Remove marked entities from local store maps; clear delete draft and focus; entities disappear from active panel/viewer |
| **Failure before any write** | Keep basket and draft; show error |
| **Partial success** | Roll back successful marks (call `erasable` on created steps in reverse order, mirroring `revertWizardCommitArtifacts` in creation); restore draft to pre-commit step; show error including rollback notice |
| **Scene reload during commit** | Abort; roll back any persisted marks; restore draft or clear wizard (mirror creation `generation` interrupt) |

Do **not** remove entities from local storage on failure.

### SSE / remote updates

If another user marks an entity erasable while the wizard is open, refresh or drop that id from the basket with a notice. If another user edits an entity in the basket, `expectedVersion` at confirm may 409 — user retries after refresh.

---

## Removal of legacy delete

- Remove delete button from individual annotation data cards.
- Remove bulk **Delete (N)** from the panel toolbar.
- Retain `markAnnotationTripletErasable` in the store only if still needed for tests or lab tooling; production UI uses the wizard commit path.

---

## Key modules (planned)

| Area | Path (expected) |
| ---- | ---------------- |
| Proposal / this doc | `doc/a08-annotation-deletion.md` |
| Store draft + commit | `frontend/src/stores/AnnotationStore.ts` |
| Setup UI | `frontend/src/features/annotation-deletion/AnnotationDeletionPanel.tsx` |
| Validation | `frontend/src/features/annotation-deletion/annotationDeletionValidation.ts` |
| Link view | `frontend/src/features/annotation-link-view/` (reuse; bypass during wizard) |
| Panel | `frontend/src/routes/components/AnnotationPanelEditor.tsx` |
| Social lock checks | `frontend/src/stores/annotation-social-locks.ts` (reuse) |

---

## Testing (planned)

### Automated

| Suite | Command | Coverage |
| ----- | ------- | -------- |
| Frontend unit + store | `npm run test:unit` | Intent matrix, basket validation, link resolution, commit order, rollback |
| Backend erasable API | existing annotation API tests | Per-entity erasable, 409 OCC |

### Manual checklist

- [ ] Link-only: select link(s) → confirm → endpoints remain active
- [ ] Geometry + Link: select geometry 1:1 → confirm → geometry + link erasable
- [ ] Data + Link: select data 1:1 → confirm → data + link erasable
- [ ] Full triplet: Link + Geometry + Data, 1:1 selection
- [ ] 1:N geometry → warning → Yes adds all links; Cancel drops selection
- [ ] 1:N data + Geometry → “Let me select” → viewer subset → OK/Cancel
- [ ] Link + Geometry + Data → link resolution modal (All / None / Let me select)
- [ ] Geometry/Data checked without all links in basket → confirm disabled
- [ ] Remote editor lock → cannot select or confirm
- [ ] 409 on commit → basket preserved, partial rollback message
- [ ] Scene reload mid-commit → interrupt handling
- [ ] Regression: create wizard and normal edit unaffected while delete wizard inactive
