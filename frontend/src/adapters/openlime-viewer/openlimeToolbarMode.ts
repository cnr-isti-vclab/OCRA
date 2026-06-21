import type { AnnotationToolbarMode } from '../../components/AnnotationToolbar';
import type { OpenLimeAnnotationManager } from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import type { OpenLIMEViewerRef } from './OpenLIMEViewer';

/** OpenLIME marker mapping for {@link AnnotationToolbarMode} (2D only). */
const OPENLIME_CREATE_MARKER: Record<
  Exclude<AnnotationToolbarMode, 'edit'>,
  { type: string; opts: Record<string, unknown> }
> = {
  point: { type: 'disk', opts: {} },
  line: { type: 'polyline', opts: { closed: false } },
  area: { type: 'polyline', opts: { closed: true } },
};

/**
 * Applies toolbar mode to the OpenLIME annotation manager.
 * Call from {@link Viewer2DPanel} when the user changes {@link AnnotationToolbar} selection.
 */
export function applyOpenLimeToolbarMode(
  manager: OpenLimeAnnotationManager,
  viewer: OpenLIMEViewerRef,
  mode: AnnotationToolbarMode,
): void {
  if (mode === 'edit') {
    viewer.enableEditing(true);
    manager.setMode('edit');
    return;
  }

  const cfg = OPENLIME_CREATE_MARKER[mode];
  manager.setActiveMarker?.(cfg.type, cfg.opts);
}
