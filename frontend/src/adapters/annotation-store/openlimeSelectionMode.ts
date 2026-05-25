import type { ViewerAnnotation } from 'shared/scene-types';
//import { syncOpenLimeAnnotations } from './syncOpenLimeAnnotations';

export type OpenLimeSelectionManager = {
  mode: string;
  _session?: unknown;
  _mode?: string;
  _syncPointerEvents?: () => void;
  viewer?: { panzoom?: { enableDoubleTapZoom: boolean } };
  setMode: (mode: 'idle' | 'create' | 'edit') => string;
  setSelectedIds?: (ids: string[]) => void;
  deselectAll: () => void;
  setSelected: (id: string, on?: boolean) => void;
};

/**
 * Leaves `create` / `idle` so annotations are selectable (`pointer-events` restored).
 * Cancels an in-progress draw session when leaving `create` with an active session.
 */
export function ensureEditModeForSelection(manager: OpenLimeSelectionManager | null): void {
  if (!manager || manager.mode === 'edit') {
    return;
  }
  if (manager.mode === 'create' || manager.mode === 'idle') {
    manager.setMode('edit');
  }
}

/**
 * Panel / store → viewer highlight: edit mode, ensure shapes exist in the layer, then select.
 * Must run in one synchronous block — OpenLIME mode changes do not re-run other React effects.
 */
export function applyViewerSelectionFromStore(
  manager: OpenLimeSelectionManager | null,
  geometryIds: string[],
  // viewerAnnotationsForSync: ViewerAnnotation[],
): void {
  if (!manager) {
    return;
  }

  if (geometryIds.length === 0) {
    manager.deselectAll();
    return;
  }

  ensureEditModeForSelection(manager);
  //syncOpenLimeAnnotations(manager, viewerAnnotationsForSync);

  if (typeof manager.setSelectedIds === 'function') {
    manager.setSelectedIds(geometryIds);
    return;
  }

  manager.deselectAll();
  geometryIds.forEach((id) => {
    manager.setSelected(id, true);
  });
}
