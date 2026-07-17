import type { AnnotationDeletionDraft } from './types';

export interface AnnotationDeletionValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * Enforce the delete intent matrix: Geometry/Data require Link;
 * at least Link must be selected to begin.
 */
export function validateDeletionSetup(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): AnnotationDeletionValidationResult {
  if (draft.deleteGeometry && !draft.deleteLink) {
    return { ok: false, message: 'Geometry delete requires Link.' };
  }
  if (draft.deleteData && !draft.deleteLink) {
    return { ok: false, message: 'Data delete requires Link.' };
  }
  if (!draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
    return { ok: false, message: 'Choose at least Link to delete.' };
  }
  if (!draft.deleteLink) {
    return { ok: false, message: 'Link must be included when deleting geometry or data.' };
  }
  return { ok: true };
}

export function canBeginDeletionWizard(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): boolean {
  return validateDeletionSetup(draft).ok;
}

/**
 * When Geometry or Data is checked, Link is forced on (auto-rule).
 */
export function applyDeletionIntentAutoLink(
  patch: Partial<Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>>,
  current: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'> {
  const next = {
    deleteLink: patch.deleteLink ?? current.deleteLink,
    deleteGeometry: patch.deleteGeometry ?? current.deleteGeometry,
    deleteData: patch.deleteData ?? current.deleteData,
  };

  if (next.deleteGeometry || next.deleteData) {
    next.deleteLink = true;
  }

  return next;
}
