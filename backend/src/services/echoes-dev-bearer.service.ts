// @spike echoes-kb-dev-bearer: remove when EGI login reliably provides the KB bearer for every authenticated session

const bearerOverrides = new Map<string, string>();

export function setEchoesDevBearerOverride(sessionId: string, bearer: string): void {
  bearerOverrides.set(sessionId, bearer);
}

export function getEchoesDevBearerOverride(sessionId: string): string | null {
  return bearerOverrides.get(sessionId) ?? null;
}

export function clearEchoesDevBearerOverride(sessionId: string): boolean {
  return bearerOverrides.delete(sessionId);
}
