/**
 * PKCE (Proof Key for Code Exchange) Utilities
 * 
 * Cryptographic functions for OAuth2 PKCE flow as defined in RFC 7636
 */

/**
 * Generate a cryptographically secure random string for PKCE code verifier
 */
export function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[byte % 64]
  ).join('');
}

/**
 * Generate SHA256 hash for PKCE code challenge
 * Falls back to plain verifier if crypto.subtle is not available (non-HTTPS contexts)
 */
export async function sha256(plain: string): Promise<string> {
  // Check if crypto.subtle is available (requires HTTPS or localhost)
  if (!crypto.subtle) {
    console.warn('crypto.subtle not available - using plain code verifier (PKCE will use "plain" method instead of S256)');
    // Return the plain string base64url encoded as fallback
    return btoa(plain)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
