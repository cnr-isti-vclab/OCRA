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
 */
export async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
