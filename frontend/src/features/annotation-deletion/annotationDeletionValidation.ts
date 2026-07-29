import type { AnnotationDeletionDraft } from './types';

export interface AnnotationDeletionValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * Enforce the delete intent matrix: at least one of Link / Geometry / Data.
 * Geometry-only and Data-only are valid (leave strong links → Ghost rendering).
 */
export function validateDeletionSetup(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): AnnotationDeletionValidationResult {
  if (!draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
    return { ok: false, message: 'Choose at least one of Link, Geometry, or Data.' };
  }
  return { ok: true };
}

export function canBeginDeletionWizard(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): boolean {
  return validateDeletionSetup(draft).ok;
}

/**
 * Merges an intent patch onto the current flags.
 * Does not force Link when Geometry/Data are set — endpoint-only delete is allowed.
 */
export function applyDeletionIntentAutoLink(
  patch: Partial<Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>>,
  current: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'> {
  return {
    deleteLink: patch.deleteLink ?? current.deleteLink,
    deleteGeometry: patch.deleteGeometry ?? current.deleteGeometry,
    deleteData: patch.deleteData ?? current.deleteData,
  };
}
