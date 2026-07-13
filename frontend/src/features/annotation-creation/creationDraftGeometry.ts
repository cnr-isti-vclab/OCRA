import type { AnnotationCreationDraft } from './types';

const PENDING_GEOMETRY_STEPS = new Set<AnnotationCreationDraft['step']>([
  'geometry',
  'data',
  'committing',
]);

export function hasPendingCreationDraftGeometry(
  draft: Pick<
    AnnotationCreationDraft,
    'geometryChoice' | 'draftShapes' | 'draftGeometryViewerId' | 'step'
  > | null
  | undefined,
): boolean {
  if (!draft || draft.geometryChoice !== 'new' || !PENDING_GEOMETRY_STEPS.has(draft.step)) {
    return false;
  }
  return draft.draftShapes.length > 0 && Boolean(draft.draftGeometryViewerId);
}

export function hasPendingCreationDraftShapes(
  draft: Pick<AnnotationCreationDraft, 'geometryChoice' | 'draftShapes' | 'step'> | null | undefined,
): boolean {
  if (!draft || draft.geometryChoice !== 'new' || !PENDING_GEOMETRY_STEPS.has(draft.step)) {
    return false;
  }
  return draft.draftShapes.length > 0;
}
