import type { RoleEnum } from 'shared/types';

export type AnnotationMode = 'edit' | 'viewer';

export type AnnotationSelectionPolicy = 'collaborative' | 'readOnly';

interface ResolveAnnotationModeInput {
  projectRole: RoleEnum | null;
  isSystemAdministrator: boolean;
}

/**
 * Resolves the annotation UX mode from the current project role.
 * Editors/managers/admins get the collaborative editing UI, viewers get read-only navigation.
 */
export function resolveAnnotationMode({
  projectRole,
  isSystemAdministrator,
}: ResolveAnnotationModeInput): AnnotationMode {
  if (isSystemAdministrator) {
    return 'edit';
  }

  if (projectRole === 'manager' || projectRole === 'editor') {
    return 'edit';
  }

  return 'viewer';
}

export function selectionPolicyForAnnotationMode(
  mode: AnnotationMode,
): AnnotationSelectionPolicy {
  return mode === 'viewer' ? 'readOnly' : 'collaborative';
}
