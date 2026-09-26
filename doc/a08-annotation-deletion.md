# Annotation Unlink and Erase

The Annotations sidebar exposes three separate actions: Annotate, Unlink, and Erase.
Annotate remains a continuous session. Unlink and Erase run once and return to
Annotations after a successful commit, restoring the previous link-view mode.
All docked operations temporarily replace the Annotations panel and occupy the
full sidebar. A detached workbench leaves Annotations visible, as in Annotate.

## Unlink

1. Choose Geometry or Data, or start directly from the current selection.
   Opening Unlink or Erase with one or more geometries/data records selected
   skips type selection and transfers the entire source selection into the operation.
2. Select one or more available endpoints in the workbench. Geometry can also be
   selected in either viewer; Data is selected in the workbench list.
   A plain list click selects one item (or deselects the sole selected item).
   Ctrl/Meta toggles multiple items. Clicking blank workbench space or pressing Esc
   clears the selection without closing the operation. Annotate ignores Ctrl/Meta
   when only one item is allowed. The same list rules apply to common counterparts.
3. Press Done to load project-wide relationships.
4. The relationship list contains only counterparts linked to every selected
   endpoint. Select one or more counterparts and press Done.
5. Only the corresponding relationships are marked erasable. Neither side is
   erased, even when its final relationship is removed.

An empty intersection cannot be unlinked. Change the selection or cancel.
The store rechecks the common relationships immediately before committing.

## Erase

1. Choose Geometry or Data and select one or more available endpoints.
2. Press Done to review the number of endpoints and active relationships affected.
3. Press Done to unlink every active relationship of the selected endpoints,
   including relationships outside the current scene, then mark those endpoints erasable.
4. The selected endpoints disappear from the available set. Counterparts are
   neither erased nor implicitly restored.

Items without relationships can also be erased.

## Presentation and safety

Geometry controls use the existing Bootstrap blue. Data controls use dark amber
(#a85d00). The counterpart list uses the color of its own entity type.

Source selections are separate from the generated commit basket. Project-wide
links are fetched before commit; existing per-entity version checks, remote editor
locks, and compensating rollback remain in place. API failures retain the draft
and selection for retry. Scene reloads interrupt the operation.

The old mixed Unlink/Delete panel and its orphan-outcome review have been removed.
The backend still exposes separate link and endpoint lifecycle primitives;
physical deletion remains a maintenance concern, not an action in this GUI.
