declare global {
  interface Window {
    __APP_CONFIG__?: {
      providerUrl?: string;
      realm?: string;
      issuer?: string;
      clientId?: string;
      redirectUri?: string;
      scope?: string;
      apiBase?: string;
      showEccchDebugOperations?: boolean;
    };
  }
}

export function getRuntimeAppConfig() {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__APP_CONFIG__ ?? {};
}

export function isEccchDebugOperationsEnabled(): boolean {
  const configured = getRuntimeAppConfig().showEccchDebugOperations;
  if (typeof configured === 'boolean') {
    return configured;
  }

  return import.meta.env.DEV;
}

export {};
