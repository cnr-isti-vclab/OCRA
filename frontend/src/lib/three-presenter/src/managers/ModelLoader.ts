import * as THREE from 'three';

/**
 * Configuration for model loading
 */
export interface LoaderConfig {
  /** Path to Draco decoder (default: Google CDN) */
  dracoDecoderPath?: string;
  /** Draco decoder type (default: 'js') */
  dracoDecoderType?: 'js' | 'wasm';
  /** Whether to automatically compute vertex normals for PLY (default: true) */
  autoComputeNormals?: boolean;
  /** Default material properties for PLY files */
  defaultMaterial?: {
    color?: number;
    flatShading?: boolean;
    metalness?: number;
    roughness?: number;
  };
}

/**
 * Material properties that can be applied to loaded models
 */
export interface MaterialProperties {
  color?: number;
  flatShading?: boolean;
  metalness?: number;
  roughness?: number;
}

/**
 * Progress callback for loading operations
 */
export type ProgressCallback = (loaded: number, total: number, percentage: number) => void;

/**
 * Result of a successful load operation
 */
export interface LoadResult {
  /** The loaded Three.js object */
  object: THREE.Object3D;
  /** The original format that was loaded */
  format: 'ply' | 'gltf' | 'glb' | 'nxs' | 'nxz';
  /** Size of the loaded data in bytes */
  byteSize: number;
}

/**
 * ModelLoader handles loading of 3D model files in various formats.
 * 
 * Supported formats:
 * - PLY (Polygon File Format)
 * - GLTF (GL Transmission Format)
 * - GLB (GLTF Binary)
 * 
 * Features:
 * - Automatic format detection from file extension
 * - Draco compression support for GLTF/GLB
 * - Material property overrides
 * - Progress tracking
 * - Error handling with detailed messages
 * - Lazy loading of format-specific loaders
 * 
 * @example
 * ```typescript
 * const loader = new ModelLoader({
 *   dracoDecoderPath: 'https://cdn.com/draco/',
 *   defaultMaterial: { color: 0xcccccc }
 * });
 * 
 * // Load from URL
 * const result = await loader.loadFromUrl('/models/scene.glb');
 * scene.add(result.object);
 * 
 * // Load from buffer with material override
 * const buffer = await fetch('/models/mesh.ply').then(r => r.arrayBuffer());
 * const result = await loader.loadFromBuffer(buffer, 'ply', {
 *   color: 0xff0000,
 *   metalness: 0.8
 * });
 * ```
 */
export class ModelLoader {
  private config: Required<LoaderConfig>;
  private plyLoader: any = null;
  private gltfLoader: any = null;
  private dracoLoader: any = null;

  /**
   * Create a new model loader
   * @param config Configuration options
   */
  constructor(config: LoaderConfig = {}) {
    this.config = {
      dracoDecoderPath: config.dracoDecoderPath ?? 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
      dracoDecoderType: config.dracoDecoderType ?? 'js',
      autoComputeNormals: config.autoComputeNormals ?? true,
      defaultMaterial: {
        color: config.defaultMaterial?.color ?? 0xdddddd,
        flatShading: config.defaultMaterial?.flatShading ?? true,
        metalness: config.defaultMaterial?.metalness,
        roughness: config.defaultMaterial?.roughness
      }
    };
  }

  /**
   * Load a model from a URL.
   * Automatically detects format from file extension.
   * 
   * @param url URL to load from
   * @param materialOverrides Optional material property overrides
   * @param onProgress Optional progress callback
   * @returns Promise resolving to load result
   */
  async loadFromUrl(
    url: string,
    materialOverrides?: MaterialProperties,
    onProgress?: ProgressCallback
  ): Promise<LoadResult> {
    // Detect format from URL
    const format = this.detectFormat(url);
    
    // For NXS/NXZ files, use direct URL loading (streaming)
    if (format === 'nxs' || format === 'nxz') {
      const object = await this.parseNexus(url, materialOverrides);
      return {
        object,
        format,
        byteSize: 0 // NXS is streamed, size unknown
      };
    }
    
    // For other formats, fetch the file
    const response = await fetch(url, { credentials: 'include' });
    
    if (!response.ok) {
      throw new Error(`Failed to load model from ${url}: HTTP ${response.status}`);
    }

    // Get content length for progress tracking
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    
    // Read the response with progress tracking
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      if (onProgress && contentLength > 0) {
        const percentage = (receivedLength / contentLength) * 100;
        onProgress(receivedLength, contentLength, percentage);
      }
    }

    // Concatenate chunks into single buffer
    const buffer = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, position);
      position += chunk.length;
    }
    
    // Load from buffer
    return this.loadFromBuffer(buffer.buffer, format, materialOverrides, url);
  }

  /**
   * Load a model from an ArrayBuffer.
   * 
   * @param buffer ArrayBuffer containing the model data
   * @param format File format ('ply', 'gltf', 'glb', 'nxs', or 'nxz')
   * @param materialOverrides Optional material property overrides
   * @param url Optional URL for streaming formats like NXS
   * @returns Promise resolving to load result
   */
  async loadFromBuffer(
    buffer: ArrayBuffer,
    format: 'ply' | 'gltf' | 'glb' | 'nxs' | 'nxz',
    materialOverrides?: MaterialProperties,
    url?: string
  ): Promise<LoadResult> {
    let object: THREE.Object3D;

    switch (format) {
      case 'ply':
        object = await this.parsePLY(buffer, materialOverrides);
        break;
      case 'gltf':
      case 'glb':
        object = await this.parseGLTF(buffer, materialOverrides);
        break;
      case 'nxs':
      case 'nxz':
        // For NXS/NXZ, we need the URL for streaming, not the buffer
        if (!url) {
          throw new Error('NXS/NXZ format requires URL for streaming');
        }
        object = await this.parseNexus(url, materialOverrides);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return {
      object,
      format,
      byteSize: buffer.byteLength
    };
  }

  /**
   * Detect file format from filename or URL
   * @param filename Filename or URL
   * @returns Detected format
   */
  detectFormat(filename: string): 'ply' | 'gltf' | 'glb' | 'nxs' | 'nxz' {
    const lower = filename.toLowerCase();
    
    if (lower.endsWith('.ply')) {
      return 'ply';
    } else if (lower.endsWith('.glb')) {
      return 'glb';
    } else if (lower.endsWith('.gltf')) {
      return 'gltf';
    } else if (lower.endsWith('.nxs')) {
      return 'nxs';
    } else if (lower.endsWith('.nxz')) {
      return 'nxz';
    }
    
    throw new Error(`Cannot detect format from filename: ${filename}`);
  }

  /**
   * Parse PLY format buffer
   * @param buffer ArrayBuffer containing PLY data
   * @param materialOverrides Optional material overrides
   * @returns Promise resolving to Three.js Mesh
   */
  private async parsePLY(
    buffer: ArrayBuffer,
    materialOverrides?: MaterialProperties
  ): Promise<THREE.Mesh> {
    // Lazy load PLYLoader
    if (!this.plyLoader) {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader');
      this.plyLoader = new PLYLoader();
    }

    // Parse geometry
    const geometry = this.plyLoader.parse(buffer);
    
    // Compute normals if enabled
    if (this.config.autoComputeNormals) {
      geometry.computeVertexNormals();
    }

    // Create material with defaults and overrides
    const materialProps = this.mergeMaterialProperties(
      this.config.defaultMaterial,
      materialOverrides
    );

    const material = new THREE.MeshStandardMaterial({
      color: materialProps.color,
      flatShading: materialProps.flatShading,
      metalness: materialProps.metalness,
      roughness: materialProps.roughness
    });

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  /**
   * Parse GLTF/GLB format buffer
   * @param buffer ArrayBuffer containing GLTF/GLB data
   * @param materialOverrides Optional material overrides
   * @returns Promise resolving to Three.js Group
   */
  private async parseGLTF(
    buffer: ArrayBuffer,
    materialOverrides?: MaterialProperties
  ): Promise<THREE.Group> {
    // Lazy load GLTF and Draco loaders
    if (!this.gltfLoader) {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader'),
        import('three/examples/jsm/loaders/DRACOLoader')
      ]);

      this.gltfLoader = new GLTFLoader();

      // Set up Draco decoder
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath(this.config.dracoDecoderPath);
      this.dracoLoader.setDecoderConfig({ type: this.config.dracoDecoderType });
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
    }

    // Parse GLTF
    return new Promise<THREE.Group>((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        '', // Resource path (not needed for buffer parsing)
        (gltf: any) => {
          const group = new THREE.Group();
          
          // Clone all meshes from the scene
          gltf.scene.traverse((child: any) => {
            if ((child as THREE.Mesh).isMesh) {
              const clonedChild = child.clone();

              // Apply material overrides if specified
              if (materialOverrides && (clonedChild as THREE.Mesh).material) {
                this.applyMaterialOverrides(
                  (clonedChild as THREE.Mesh).material as THREE.Material,
                  materialOverrides
                );
              }

              group.add(clonedChild);
            }
          });
          
          resolve(group);
        },
        (error: any) => {
          reject(new Error(`Failed to parse GLTF: ${error.message || error}`));
        }
      );
    });
  }

  /**
   * Parse Nexus (NXS/NXZ) format from URL
   * Nexus is a multiresolution format that streams data incrementally
   * @param url URL to the .nxs or .nxz file
   * @param materialOverrides Optional material overrides (not typically used with Nexus)
   * @returns Promise resolving to NexusObject
   */
  private async parseNexus(
    url: string,
    materialOverrides?: MaterialProperties
  ): Promise<THREE.Object3D> {
    // Lazy load nexus3d library
    const { NexusObject } = await import('nexus3d');
    
    // Create a NexusObject instance
    // NexusObject extends THREE.Mesh and handles streaming automatically
    const nexusObject = new NexusObject(
      url,
      () => console.log('✅ Nexus model loaded:', url),
      () => console.log('🔄 Nexus model updated (new data streamed)'),
      (error: Error) => console.error('❌ Nexus error:', error)
    );
    
    // NexusObject is a THREE.Mesh that manages its own material and geometry
    // The material is created internally by Nexus and updated during streaming
    
    console.log('🔄 Nexus model created, streaming will begin automatically:', url);
    
    return nexusObject;
  }

  /**
   * Apply material property overrides to an existing material
   * @param material Three.js material to modify
   * @param overrides Properties to override
   */
  private applyMaterialOverrides(
    material: THREE.Material,
    overrides: MaterialProperties
  ): void {
    const mat = material as any;

    if (mat.color && overrides.color !== undefined) {
      mat.color = new THREE.Color(overrides.color);
    }

    if (mat.metalness !== undefined && overrides.metalness !== undefined) {
      mat.metalness = overrides.metalness;
    }

    if (mat.roughness !== undefined && overrides.roughness !== undefined) {
      mat.roughness = overrides.roughness;
    }

    if (overrides.flatShading !== undefined) {
      mat.flatShading = overrides.flatShading;
      mat.needsUpdate = true;
    }
  }

  /**
   * Merge material properties, with overrides taking precedence
   * @param defaults Default properties
   * @param overrides Override properties
   * @returns Merged properties
   */
  private mergeMaterialProperties(
    defaults: MaterialProperties,
    overrides?: MaterialProperties
  ): Required<MaterialProperties> {
    return {
      color: overrides?.color ?? defaults.color ?? 0xdddddd,
      flatShading: overrides?.flatShading ?? defaults.flatShading ?? true,
      metalness: overrides?.metalness ?? defaults.metalness ?? 0.5,
      roughness: overrides?.roughness ?? defaults.roughness ?? 0.5
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): Readonly<Required<LoaderConfig>> {
    return { ...this.config };
  }

  /**
   * Update the Draco decoder path
   * @param path New path to Draco decoder
   */
  setDracoDecoderPath(path: string): void {
    this.config.dracoDecoderPath = path;
    if (this.dracoLoader) {
      this.dracoLoader.setDecoderPath(path);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
      this.dracoLoader = null;
    }
    this.plyLoader = null;
    this.gltfLoader = null;
  }
}

/**
 * Convenience function to create a model loader with default configuration
 */
export function createModelLoader(config?: LoaderConfig): ModelLoader {
  return new ModelLoader(config);
}
