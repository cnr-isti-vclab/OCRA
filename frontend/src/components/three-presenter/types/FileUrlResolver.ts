/**
 * File URL Resolver Interface
 * 
 * Provides a clean abstraction for resolving file URLs from relative paths.
 * This makes ThreePresenter independent of any specific API or configuration system.
 * 
 * @module FileUrlResolver
 */

/**
 * Context information needed to resolve a file URL
 */
export interface FileResolverContext {
  /** Project identifier (if applicable) */
  projectId?: string;
  
  /** Scene identifier (if applicable) */
  sceneId?: string;
  
  /** Additional context data */
  [key: string]: any;
}

/**
 * Interface for resolving file URLs
 * 
 * Implementations can provide different strategies:
 * - OCRA API resolver (uses backend API)
 * - Static file resolver (uses local/CDN paths)
 * - Custom resolver (user-defined logic)
 */
export interface FileUrlResolver {
  /**
   * Resolve a file path to a full URL
   * 
   * @param filePath - The file path to resolve (can be relative or absolute)
   * @param context - Additional context for resolution (e.g., projectId)
   * @returns The full URL to load the file from
   * 
   * @example
   * ```typescript
   * // Relative path
   * const url = resolver.resolve('model.glb', { projectId: '123' });
   * // => 'http://localhost:3000/api/projects/123/files/model.glb'
   * 
   * // Absolute path (pass through)
   * const url = resolver.resolve('http://example.com/model.glb', {});
   * // => 'http://example.com/model.glb'
   * ```
   */
  resolve(filePath: string, context: FileResolverContext): string;
}

/**
 * Default file URL resolver
 * 
 * Simple implementation that:
 * - Returns absolute URLs unchanged
 * - Returns relative URLs unchanged (assumes they're relative to the current page)
 * 
 * Useful for:
 * - Loading files from the same origin
 * - Development/testing
 * - Simple deployments where files are co-located
 */
export class DefaultFileUrlResolver implements FileUrlResolver {
  resolve(filePath: string, context: FileResolverContext): string {
    // If already absolute URL, return as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Return relative path unchanged (browser will resolve relative to current page)
    return filePath;
  }
}

/**
 * Static base URL resolver
 * 
 * Prepends a base URL to relative paths.
 * Useful for CDN or static file hosting.
 * 
 * @example
 * ```typescript
 * const resolver = new StaticBaseUrlResolver('https://cdn.example.com/models');
 * const url = resolver.resolve('scene.glb', {});
 * // => 'https://cdn.example.com/models/scene.glb'
 * ```
 */
export class StaticBaseUrlResolver implements FileUrlResolver {
  constructor(private baseUrl: string) {
    // Remove trailing slash for consistency
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  resolve(filePath: string, context: FileResolverContext): string {
    // If already absolute URL, return as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Remove leading slash from filePath if present
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    
    return `${this.baseUrl}/${cleanPath}`;
  }
}

/**
 * Function-based resolver
 * 
 * Wraps a custom resolution function as a FileUrlResolver.
 * Most flexible option for custom logic.
 * 
 * @example
 * ```typescript
 * const resolver = new FunctionResolver((path, ctx) => {
 *   if (path.startsWith('http')) return path;
 *   return `https://api.example.com/files/${ctx.projectId}/${path}`;
 * });
 * ```
 */
export class FunctionResolver implements FileUrlResolver {
  constructor(
    private resolveFn: (filePath: string, context: FileResolverContext) => string
  ) {}

  resolve(filePath: string, context: FileResolverContext): string {
    return this.resolveFn(filePath, context);
  }
}
