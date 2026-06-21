import type { ViewerAnnotation } from 'shared/scene-types';
import {
  applyOpenLimeImportMetadata,
  type OpenLimeJsonLdImportEntry,
  openLimePolylineHasVertexHandles,
  viewerAnnotationToOpenLimeJsonLd,
  viewerGeometryMatchesOpenLime,
} from './viewerAnnotationToOpenLimeImport';

export type OpenLimeLabelVisibility = 'none' | 'all' | 'selected';
export type OpenLimeSelectionInteractionMode = 'preserve' | 'edit';

/** OpenLIME annotation instance (structural typing). */
export type OpenLimeSyncedAnnotation = {
  id: string;
  label?: string;
  class?: string | number | null;
  semanticClass?: string | null;
  strokeDasharray?: string | null;
  type?: string;
  data?: Record<string, unknown>;
  svg?: string | null;
  elements?: Array<{
    classList?: { contains: (c: string) => boolean };
    getAttribute?: (name: string) => string | null;
    setAttribute?: (name: string, value: string) => void;
    removeAttribute?: (name: string) => void;
    style?: CSSStyleDeclaration;
  }>;
  ready?: boolean;
  needsUpdate?: boolean;
};

function applyStrokeDasharray(
  anno: OpenLimeSyncedAnnotation,
  strokeDasharray: string | null | undefined,
): void {
  for (const element of anno.elements ?? []) {
    const isStrokeElement =
      element.classList?.contains('annotation-disk') ||
      element.classList?.contains('annotation-polyline') ||
      element.classList?.contains('annotation-rect') ||
      element.classList?.contains('annotation-freehand');
    if (!isStrokeElement) {
      continue;
    }
    if (strokeDasharray) {
      element.setAttribute?.('stroke-dasharray', strokeDasharray);
    } else {
      element.removeAttribute?.('stroke-dasharray');
    }
  }
}

function ensureElementsFromSvg(anno: OpenLimeSyncedAnnotation): void {
  if (anno.ready && anno.elements && anno.elements.length > 0) {
    return;
  }
  if (!anno.svg || typeof anno.svg !== 'string') {
    return;
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(anno.svg, 'image/svg+xml');
    const root = doc.documentElement;
    // `Annotation.syncSvg()` may produce either a single element or a <g>.
    // We always store the children as the element list expected by LayerSvgAnnotation.
    anno.elements = [...root.children] as any;
    anno.ready = true;
    anno.needsUpdate = true;
  } catch {
    // ignore — will be parsed by LayerSvgAnnotation.prefetch later
  }
}

/**
 * Minimal surface of {@link OpenLIME.ManagerSvgAnnotation} used by the OCRA adapter.
 * Intentionally structural typing — no OpenLIME import in the React layer.
 */
export type OpenLimeAnnotationManager = {
  mode: string;
  /** True when the OpenLIME pencil is enabled (`ManagerSvgAnnotation.toggle`). */
  active?: boolean;
  toggle?: (force?: boolean) => boolean;
  /** In-progress draw session; skip layer sync while set. */
  _session?: unknown;
  layer?: { selected?: Set<string> };
  viewer?: { redraw?: () => void; panzoom?: { enableDoubleTapZoom: boolean } };
  getAnnotations: () => Array<{ id: string }>;
  getAnnotationById: (id: string) => OpenLimeSyncedAnnotation | null;
  deleteAnnotation: (id: string) => void;
  importAnnotations: (jsonLdArray: OpenLimeJsonLdImportEntry[]) => void;
  setMode: (mode: 'idle' | 'create' | 'edit') => string;
  setSemanticClasses?: (classes: Record<string, Record<string, unknown>>, repaint?: boolean) => void;
  setAnnotationSemanticClass?: (id: string, classId: string | number | null) => void;
  selectAnnotations?: (
    ids: string[],
    append?: boolean,
    options?: {
      source?: string;
      originalEvent?: Event | PointerEvent | null;
      interactionMode?: OpenLimeSelectionInteractionMode;
    },
  ) => unknown;
  setSelectedIds?: (
    ids: string[],
    options?: {
      source?: string;
      originalEvent?: Event | PointerEvent | null;
      interactionMode?: OpenLimeSelectionInteractionMode;
    },
  ) => void;
  deselectAll: () => void;
  setSelected: (id: string, on?: boolean) => void;
  setAnnotationStructuralClass?: (id: string, classId: string | null) => void;
  setLabelVisibility?: (mode: OpenLimeLabelVisibility, repaint?: boolean) => OpenLimeLabelVisibility;
  getLabelVisibility?: () => OpenLimeLabelVisibility;
  setActiveMarker?: (type: string, opts?: Record<string, unknown>) => void;
};

/**
 * Leaves `create` / `idle` so annotations are selectable (`pointer-events` restored).
 * Cancels an in-progress draw session when leaving `create` with an active session.
 */
export function ensureEditModeForSelection(manager: OpenLimeAnnotationManager | null): void {
  if (!manager) {
    return;
  }
  // setMode('edit') alone does not enable the pencil; annotations stay pointer-events:none.
  if (!manager.active && typeof manager.toggle === 'function') {
    manager.toggle(true);
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
  excludeIds?: Set<string>,
): void {
  if (!manager || (manager.mode === 'create' && manager._session)) {
    return;
  }

  const targetIds = new Set(viewerAnnotations.map((a) => a.id));
  const existingIds = manager.getAnnotations().map((a) => a.id);
  let labelsUpdated = false;
  let stylesUpdated = false;

  for (const id of existingIds) {
    if (!targetIds.has(id)) {
      manager.deleteAnnotation(id);
    }
  }

  const toImport: OpenLimeJsonLdImportEntry[] = [];

  for (const viewerAnno of viewerAnnotations) {
    let existing = manager.getAnnotationById(viewerAnno.id);

    if (existing) {
      // Skip geometry stale check for annotations being actively dragged by this user.
      // The local drag state in OpenLIME must not be overwritten by a concurrent SSE update.
      if (excludeIds?.has(viewerAnno.id)) {
        if (viewerAnno.label && existing.label !== viewerAnno.label) {
          existing.label = viewerAnno.label;
          delete (existing as { _labelLayoutCacheKey?: string })._labelLayoutCacheKey;
          existing.needsUpdate = true;
          labelsUpdated = true;
        }
        if ((existing.semanticClass ?? null) !== (viewerAnno.semanticClass ?? null)) {
          existing.semanticClass = viewerAnno.semanticClass ?? null;
          existing.needsUpdate = true;
          stylesUpdated = true;
        }
        if ((existing.strokeDasharray ?? null) !== (viewerAnno.strokeDasharray ?? null)) {
          existing.strokeDasharray = viewerAnno.strokeDasharray ?? null;
          applyStrokeDasharray(existing, existing.strokeDasharray);
          existing.needsUpdate = true;
          stylesUpdated = true;
        }
        continue;
      }

      const geometryStale =
        !viewerGeometryMatchesOpenLime(viewerAnno, existing);
      const handlesMissing =
        viewerAnno.type !== 'point' && !openLimePolylineHasVertexHandles(existing);

      if (geometryStale || handlesMissing) {
        manager.deleteAnnotation(viewerAnno.id);
        existing = null;
      } else if (viewerAnno.label && existing.label !== viewerAnno.label) {
        existing.label = viewerAnno.label;
        delete (existing as { _labelLayoutCacheKey?: string })._labelLayoutCacheKey;
        existing.needsUpdate = true;
        labelsUpdated = true;
      }

      if (existing && (existing.semanticClass ?? null) !== (viewerAnno.semanticClass ?? null)) {
        existing.semanticClass = viewerAnno.semanticClass ?? null;
        existing.needsUpdate = true;
        stylesUpdated = true;
      }
      if (existing && (existing.strokeDasharray ?? null) !== (viewerAnno.strokeDasharray ?? null)) {
        existing.strokeDasharray = viewerAnno.strokeDasharray ?? null;
        applyStrokeDasharray(existing, existing.strokeDasharray);
        existing.needsUpdate = true;
        stylesUpdated = true;
      }
    }

    if (existing) {
      continue;
    }

    const entry = viewerAnnotationToOpenLimeJsonLd(viewerAnno);
    if (entry) {
      toImport.push(entry);
    }
  }

  if (toImport.length > 0) {
    // Preserve current selection so we can re-apply it after import.
    const selectedIds = manager.layer?.selected ? [...manager.layer.selected] : [];

    manager.importAnnotations(toImport);
    for (const entry of toImport) {
      const anno = manager.getAnnotationById(entry.id);
      const viewerAnno = viewerAnnotations.find((a) => a.id === entry.id);
      if (anno && viewerAnno) {
        applyOpenLimeImportMetadata(anno, viewerAnno);
        // Make SVG elements available immediately so OpenLIME's style application
        // (triggered by deselect/select) can affect them without waiting for prefetch().
        ensureElementsFromSvg(anno);
        applyStrokeDasharray(anno, viewerAnno.strokeDasharray ?? null);
      }
    }

    // Newly imported annotations start with minimal SVG attributes; force OpenLIME to
    // (re)apply class styles to elements via its selection update pipeline.
    // This avoids relying on hardcoded inline SVG style attributes.
    manager.deselectAll();
    if (selectedIds.length > 0 && typeof manager.setSelectedIds === 'function') {
      manager.setSelectedIds(selectedIds);
    }

    labelsUpdated = true;
  }

  if (labelsUpdated || stylesUpdated) {
    manager.viewer?.redraw?.();
    if (toImport.length > 0) {
      // getBBox() returns 0 until the browser paints; double-RAF fires after the first
      // paint so OpenLIME can measure real text dimensions on the second redraw.
      requestAnimationFrame(() => { requestAnimationFrame(() => { manager.viewer?.redraw?.(); }); });
    }
  }
}

/**
 * Applies viewer selection only (no shape sync).
 * Use after {@link syncOpenLimeAnnotations} or when geometries are already on the canvas.
 */
export function applyOpenLimeSelection(
  manager: OpenLimeAnnotationManager | null,
  geometryIds: string[],
  interactionMode: OpenLimeSelectionInteractionMode = 'edit',
): void {
  if (!manager) {
    return;
  }

  if (geometryIds.length === 0) {
    manager.deselectAll();
    return;
  }

  if (interactionMode === 'edit') {
    ensureEditModeForSelection(manager);
  }

  if (typeof manager.selectAnnotations === 'function') {
    manager.selectAnnotations(geometryIds, false, {
      source: 'programmatic',
      originalEvent: null,
      interactionMode,
    });
    // Selection changes must trigger a redraw so LayerSvgAnnotation.prefetch runs and
    // ManagerSvgAnnotation can add/remove label elements for labelVisibility='selected'.
    manager.viewer?.redraw?.();
    requestAnimationFrame(() => manager.viewer?.redraw?.());
    return;
  }

  if (typeof manager.setSelectedIds === 'function') {
    manager.setSelectedIds(geometryIds, {
      source: 'programmatic',
      originalEvent: null,
      interactionMode,
    });
    manager.viewer?.redraw?.();
    requestAnimationFrame(() => manager.viewer?.redraw?.());
    return;
  }

  manager.deselectAll();
  geometryIds.forEach((id) => {
    manager.setSelected(id, true);
  });
  manager.viewer?.redraw?.();
  requestAnimationFrame(() => manager.viewer?.redraw?.());
}

/**
 * Full store → viewer pass: sync shapes, then select.
 * Prefer separate sync + {@link applyOpenLimeSelection} in React effects to avoid
 * re-importing geometry on every focus change (which drops the selected style for one frame).
 */
export function applyViewerSelectionFromStore(
  manager: OpenLimeAnnotationManager | null,
  geometryIds: string[],
  viewerAnnotationsForSync: ViewerAnnotation[],
  interactionMode: OpenLimeSelectionInteractionMode = 'edit',
): void {
  if (!manager) {
    return;
  }

  if (geometryIds.length === 0) {
    manager.deselectAll();
    return;
  }

  if (interactionMode === 'edit') {
    ensureEditModeForSelection(manager);
  }
  syncOpenLimeAnnotations(manager, viewerAnnotationsForSync);
  applyOpenLimeSelection(manager, geometryIds, interactionMode);
}

/**
 * Applies the OpenLIME `underEditing` structural class to locked geometries.
 * Used to surface remote editor social-locks in the 2D viewer.
 */
export function applyOpenLimeUnderEditing(
  manager: OpenLimeAnnotationManager | null,
  geometryIdsUnderEditing: string[],
): void {
  if (!manager) {
    return;
  }

  const underEditing = new Set(geometryIdsUnderEditing);
  const allIds = manager.getAnnotations().map((a) => a.id);

  if (typeof manager.setAnnotationStructuralClass === 'function') {
    allIds.forEach((id) => {
      manager.setAnnotationStructuralClass?.(id, underEditing.has(id) ? 'underEditing' : null);
    });
    manager.viewer?.redraw?.();
    return;
  }

  // Fallback for older OpenLIME typings/builds without setAnnotationStructuralClass.
  allIds.forEach((id) => {
    const anno = manager.getAnnotationById(id) as (OpenLimeSyncedAnnotation & { structuralClass?: string | null }) | null;
    if (!anno) {
      return;
    }
    const nextClass = underEditing.has(id) ? 'underEditing' : null;
    if ((anno.structuralClass ?? null) === nextClass) {
      return;
    }
    anno.structuralClass = nextClass;
    anno.needsUpdate = true;
  });
  manager.viewer?.redraw?.();
}
