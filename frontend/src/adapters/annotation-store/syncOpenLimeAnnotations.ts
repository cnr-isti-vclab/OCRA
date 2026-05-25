import type { ViewerAnnotation } from 'shared/scene-types';

type OpenLimeAnnotationManager = {
  mode: string;
  /** In-progress draw session; skip sync while set to avoid fighting the draft. */
  _session?: unknown;
  viewer?: { redraw?: () => void };
  getAnnotations: () => Array<{ id: string }>;
  getAnnotationById: (id: string) => { id: string; label?: string } | null;
  deleteAnnotation: (id: string) => void;
  createAnnotation: (
    pos: { x: number; y: number },
    opts?: { label?: string; select?: boolean },
  ) => { id: string };
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
 * Keeps the OpenLIME layer aligned with active store geometries (add/remove only).
 *
 * Does not call `updateAnnotation` — that emits OpenLIME `update` events which would
 * be forwarded to the annotation API as geometry PATCHes. Label/display updates from
 * panel focus belong in the viewer only, not in MongoDB geometry writes.
 */
export function syncOpenLimeAnnotations(
  manager: OpenLimeAnnotationManager | null,
  viewerAnnotations: ViewerAnnotation[],
): void {
  // Skip only during an active draw session, not merely because mode is `create`.
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

  for (const viewerAnno of viewerAnnotations) {
    const existing = manager.getAnnotationById(viewerAnno.id);
    if (existing) {
      if (viewerAnno.label && existing.label !== viewerAnno.label) {
        existing.label = viewerAnno.label;
        labelsUpdated = true;
      }
      continue;
    }

    if (viewerAnno.type !== 'point' || !isPointGeometry(viewerAnno.geometry)) {
      continue;
    }

    const created = manager.createAnnotation(
      { x: viewerAnno.geometry[0], y: viewerAnno.geometry[1] },
      { label: viewerAnno.label, select: false },
    );
    created.id = viewerAnno.id;
  }

  if (labelsUpdated) {
    manager.viewer?.redraw?.();
  }
}
