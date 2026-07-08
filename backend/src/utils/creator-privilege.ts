/**
 * Runtime helpers for effective creator privileges.
 *
 * Demo environments can temporarily elevate every authenticated user to creator
 * without mutating persisted user records.
 */

function normalizeEnvFlag(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Returns true when the demo override grants creator privileges to every
 * authenticated user.
 */
export function isDemoAllUsersCreatorEnabled(): boolean {
  const normalizedValue = normalizeEnvFlag(process.env.DEMO_ALL_USERS_CREATOR);
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}

/**
 * Resolves the creator privilege visible to the application at runtime.
 */
export function resolveEffectiveCreatorPrivilege(sysCreator: boolean | null | undefined): boolean {
  return sysCreator === true || isDemoAllUsersCreatorEnabled();
}
