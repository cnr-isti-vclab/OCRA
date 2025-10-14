/**
 * OCRA-specific File URL Resolver
 * 
 * Resolves file paths using OCRA's backend API.
 * This is the default resolver for OCRA but is separate from ThreePresenter,
 * making ThreePresenter independent and reusable.
 * 
 * @module OcraFileUrlResolver
 */

import type { FileUrlResolver, FileResolverContext } from './types/FileUrlResolver';

/**
 * Get API base URL from configuration
 * 
 * Checks multiple sources in order:
 * 1. Vite environment variable (development)
 * 2. Runtime window.__APP_CONFIG__ (production/Docker)
 * 3. Fallback to localhost:3002 (OCRA backend default port)
 */
function getApiBase(): string {
  // Development: Use Vite environment variable
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  // Docker/Production: Use runtime config from window.__APP_CONFIG__
  if (typeof window !== 'undefined' && window.__APP_CONFIG__?.apiBase) {
    return window.__APP_CONFIG__.apiBase;
  }

  // Fallback for development (OCRA backend default port)
  return 'http://localhost:3002';
}

/**
 * OCRA File URL Resolver
 * 
 * Resolves files using OCRA's backend API endpoint:
 * `/api/projects/{projectId}/files/{filename}`
 * 
 * Requires projectId in context for relative paths.
 * 
 * @example
 * ```typescript
 * const resolver = new OcraFileUrlResolver();
 * 
 * // Relative path - uses OCRA API
 * const url = resolver.resolve('model.glb', { projectId: '123' });
 * // => 'http://localhost:3000/api/projects/123/files/model.glb'
 * 
 * // Absolute path - returned unchanged
 * const url = resolver.resolve('http://cdn.example.com/model.glb', {});
 * // => 'http://cdn.example.com/model.glb'
 * ```
 */
export class OcraFileUrlResolver implements FileUrlResolver {
  /**
   * Resolve a file path to OCRA API URL
   * 
   * @param filePath - File path (relative or absolute)
   * @param context - Must contain projectId for relative paths
   * @returns Full URL to file
   * @throws Error if relative path used without projectId
   */
  resolve(filePath: string, context: FileResolverContext): string {
    // If already absolute URL (http/https), return as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    // Relative path - construct OCRA API URL
    if (!context.projectId) {
      throw new Error(
        `Cannot resolve file "${filePath}": projectId required in context for relative paths`
      );
    }

    const apiBase = getApiBase();
    const encodedPath = encodeURIComponent(filePath);
    
    return `${apiBase}/api/projects/${context.projectId}/files/${encodedPath}`;
  }
}
