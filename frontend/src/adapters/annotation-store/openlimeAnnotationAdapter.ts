import type { ViewerAnnotation } from 'shared/scene-types';
import {
  applyOpenLimeImportMetadata,
  type OpenLimeJsonLdImportEntry,
  openLimePolylineHasVertexHandles,
  viewerAnnotationToOpenLimeJsonLd,
  viewerGeometryMatchesOpenLime,
} from './viewerAnnotationToOpenLimeImport';

/** OpenLIME annotation instance (structural typing). */
export type OpenLimeSyncedAnnotation = {
  id: string;
  label?: string;
  type?: string;
  data?: Record<string, unknown>;
  elements?: Array<{
    classList?: { contains: (c: string) => boolean };
    getAttribute?: (name: string) => string | null;
  }>;
  ready?: boolean;
  needsUpdate?: boolean;
};

/**
 * Minimal surface of {@link OpenLIME.ManagerSvgAnnotation} used by the OCRA adapter.
 * Intentionally structural typing — no OpenLIME import in the React layer.
 */
export type OpenLimeAnnotationManager = {
  mode: string;
  /** In-progress draw session; skip layer sync while set. */
  _session?: unknown;
  viewer?: { redraw?: () => void; panzoom?: { enableDoubleTapZoom: boolean } };
  getAnnotations: () => Array<{ id: string }>;
  getAnnotationById: (id: string) => OpenLimeSyncedAnnotation | null;
  deleteAnnotation: (id: string) => void;
  importAnnotations: (jsonLdArray: OpenLimeJsonLdImportEntry[]) => void;
  createAnnotation: (
    pos: { x: number; y: number },
    opts?: { label?: string; select?: boolean },
  ) => { id: string; label?: string };
  setMode: (mode: 'idle' | 'create' | 'edit') => string;
  setSelectedIds?: (ids: string[]) => void;
  deselectAll: () => void;
  setSelected: (id: string, on?: boolean) => void;
};

function isPointGeometry(
  geometry: ViewerAnnotation['geometry'],
): geometry is [number, number, number] {
  return (
    Array.isArray(geometry) &&
    geometry.length === 3 &&
    typeof geometry[0] === 'number' &&
    !Array.isArray(geometry[0])
  );
}

/**
 * Leaves `create` / `idle` so annotations are selectable (`pointer-events` restored).
 * Cancels an in-progress draw session when leaving `create` with an active session.
 */
export function ensureEditModeForSelection(manager: OpenLimeAnnotationManager | null): void {
  if (!manager || manager.mode === 'edit') {
    return;
  }
  if (manager.mode === 'create' || manager.mode === 'idle') {
    manager.setMode('edit');
  }
}

/**
 * Keeps the OpenLIME layer aligned with active store geometries (add/remove + label patch).
 *
 * Does not call `updateAnnotation` — that emits OpenLIME `update` events which would
 * be forwarded to the annotation API as geometry PATCHes.
 */
export function syncOpenLimeAnnotations(
  manager: OpenLimeAnnotationManager | null,
  viewerAnnotations: ViewerAnnotation[],
): void {
  if (!manager || (manager.mode === 'create' && manager._session)) {
    return;
  }

  const targetIds = new Set(viewerAnnotations.map((a) => a.id));
  const existingIds = manager.getAnnotations().map((a) => a.id);
  let labelsUpdated = false;

  for (const id of existingIds) {
    if (!targetIds.has(id)) {
      manager.deleteAnnotation(id);
    }
  }

  const toImport: OpenLimeJsonLdImportEntry[] = [];

  for (const viewerAnno of viewerAnnotations) {
    let existing = manager.getAnnotationById(viewerAnno.id);

    if (existing) {
      const geometryStale =
        !viewerGeometryMatchesOpenLime(viewerAnno, existing);
      const handlesMissing =
        viewerAnno.type !== 'point' && !openLimePolylineHasVertexHandles(existing);

      if (geometryStale || handlesMissing) {
        manager.deleteAnnotation(viewerAnno.id);
        existing = null;
      } else if (viewerAnno.label && existing.label !== viewerAnno.label) {
        existing.label = viewerAnno.label;
        labelsUpdated = true;
      }
    }

    if (existing) {
      continue;
    }

    if (viewerAnno.type === 'point' && isPointGeometry(viewerAnno.geometry)) {
      const created = manager.createAnnotation(
        { x: viewerAnno.geometry[0], y: viewerAnno.geometry[1] },
        { label: viewerAnno.label, select: false },
      );
      created.id = viewerAnno.id;
      continue;
    }

    const entry = viewerAnnotationToOpenLimeJsonLd(viewerAnno);
    if (entry) {
      toImport.push(entry);
    }
  }

  if (toImport.length > 0) {
    manager.importAnnotations(toImport);
    for (const entry of toImport) {
      const anno = manager.getAnnotationById(entry.id);
      const viewerAnno = viewerAnnotations.find((a) => a.id === entry.id);
      if (anno && viewerAnno) {
        applyOpenLimeImportMetadata(anno, viewerAnno);
      }
    }
    labelsUpdated = true;
  }

  if (labelsUpdated) {
    manager.viewer?.redraw?.();
  }
}

/**
 * Panel / store → viewer highlight: edit mode, sync shapes, then select.
 * Must run in one synchronous block — OpenLIME mode changes do not re-run other React effects.
 */
export function applyViewerSelectionFromStore(
  manager: OpenLimeAnnotationManager | null,
  geometryIds: string[],
  viewerAnnotationsForSync: ViewerAnnotation[],
): void {
  if (!manager) {
    return;
  }

  if (geometryIds.length === 0) {
    manager.deselectAll();
    return;
  }

  ensureEditModeForSelection(manager);
  syncOpenLimeAnnotations(manager, viewerAnnotationsForSync);

  if (typeof manager.setSelectedIds === 'function') {
    manager.setSelectedIds(geometryIds);
    return;
  }

  manager.deselectAll();
  geometryIds.forEach((id) => {
    manager.setSelected(id, true);
  });
}
