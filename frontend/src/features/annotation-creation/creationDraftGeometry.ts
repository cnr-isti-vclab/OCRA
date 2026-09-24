import type { AnnotationCreationDraft } from './types';
import { lastCreatedGeometry } from './rememberCreationSetup';

const PENDING_GEOMETRY_STEPS = new Set<AnnotationCreationDraft['step']>([
  'geometry',
  'data',
  'committing',
]);

export function hasPendingCreationDraftGeometry(
  draft: Pick<
    AnnotationCreationDraft,
    'geometryMode' | 'createdGeometries' | 'step'
  > | null
  | undefined,
): boolean {
  if (!draft || draft.geometryMode !== 'new' || !PENDING_GEOMETRY_STEPS.has(draft.step)) {
    return false;
  }
  const last = lastCreatedGeometry(draft);
  return Boolean(last && last.shapes.length > 0 && last.viewerId);
}

export function hasPendingCreationDraftShapes(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'createdGeometries' | 'step'> | null | undefined,
): boolean {
  if (!draft || draft.geometryMode !== 'new' || !PENDING_GEOMETRY_STEPS.has(draft.step)) {
    return false;
  }
  const last = lastCreatedGeometry(draft);
  return Boolean(last && last.shapes.length > 0);
}
