import type { OpenLimeAnnotationManager } from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import { CREATION_DRAFT_GEOMETRY_ID } from './constants';

/**
 * Removes stale creation-draft overlays from OpenLIME.
 * The wizard keeps the native drawn annotation id in the draft; legacy `creation-draft`
 * imports and orphaned viewer ids must be purged explicitly.
 */
export function purgeCreationGeometryDrafts(
  manager: OpenLimeAnnotationManager | null | undefined,
  options: {
    /** Draft viewer id that should be kept (if still present). */
    keepViewerId?: string | null;
    /** Viewer ids that were replaced and must be removed even if still on canvas. */
    removeViewerIds?: Iterable<string>;
  } = {},
): void {
  if (!manager) {
    return;
  }

  if (manager.getAnnotationById(CREATION_DRAFT_GEOMETRY_ID)) {
    manager.deleteAnnotation(CREATION_DRAFT_GEOMETRY_ID);
  }

  const keepViewerId = options.keepViewerId ?? null;
  for (const viewerId of options.removeViewerIds ?? []) {
    if (!viewerId || viewerId === keepViewerId) {
      continue;
    }
    if (manager.getAnnotationById(viewerId)) {
      manager.deleteAnnotation(viewerId);
    }
  }
}
