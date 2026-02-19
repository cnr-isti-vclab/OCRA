/**
 * OCRA-specific File URL Resolver
 *
 * Resolves model file paths to the *static assets* endpoints exposed by the backend.
 *
 * New expected file path format (stored in scene.json):
 *   <assetId>/<filename>
 *
 * New public URL format:
 *   /assets/projects/<projectId>/3d-model/<assetId>/<filename>
 *
 * Notes:
 * - If `filePath` is already an absolute URL (http/https), it is returned as-is.
 * - For relative paths we require `context.projectId`.
 */

import type {
  FileUrlResolver,
  FileResolverContext,
} from "three-presenter";

/**
 * Get API base URL from configuration
 *
 * Checks multiple sources in order:
 * 1) Vite environment variable (development)
 * 2) Runtime window.__APP_CONFIG__ (production/Docker)
 * 3) Same-origin (reverse proxy deployments)
 * 4) Fallback to localhost:3002 (OCRA backend default port)
 */
function getApiBase(): string {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  if (typeof window !== "undefined" && window.__APP_CONFIG__?.apiBase) {
    return window.__APP_CONFIG__.apiBase;
  }

  // Reverse-proxy deployments: same origin
  if (
    typeof window !== "undefined" &&
    window.location.origin !== "http://localhost:5173"
  ) {
    return window.location.origin;
  }

  console.warn(
    "[OcraFileUrlResolver] API base URL not configured; falling back to http://localhost:3002"
  );
  return "http://localhost:3002";
}

/**
 * Encode a "path" while preserving slashes.
 * `encodeURIComponent("a/b")` => "a%2Fb" (WRONG for URLs)
 * We must encode each segment instead.
 */
function encodePathPreservingSlashes(p: string): string {
  return p
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

export class OcraFileUrlResolver implements FileUrlResolver {
  /**
   * Resolve a file path to a public static URL
   *
   * @param filePath - File path (relative or absolute)
   * @param context - Must contain projectId for relative paths
   * @returns Full URL to the file under /assets/projects/...
   */
  resolve(filePath: string, context: FileResolverContext): string {
    // Absolute URL: pass through
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      return filePath;
    }

    if (!context.projectId) {
      throw new Error(
        `Cannot resolve file "${filePath}": projectId required in context for relative paths`
      );
    }

    const apiBase = getApiBase();
    const encodedPath = encodePathPreservingSlashes(filePath);

    // New static assets path for 3D models
    return `${apiBase}/assets/projects/${encodeURIComponent(
      context.projectId
    )}/3d-model/${encodedPath}`;
  }
}
