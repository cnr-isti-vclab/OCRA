/**
 * Geometry Statistics and Utilities
 * 
 * Pure utility functions for analyzing and calculating Three.js geometry properties.
 * All functions are stateless and side-effect free, making them easy to test and reuse.
 * 
 * @module GeometryUtils
 */

import * as THREE from 'three';

/**
 * Statistics about a 3D object's geometry
 */
export interface GeometryStats {
  /** Total number of triangles (faces) */
  triangles: number;
  
  /** Total number of vertices */
  vertices: number;
  
  /** Bounding box dimensions */
  bbox: {
    x: number;
    y: number;
    z: number;
  };
  
  /** Texture information */
  textures: {
    count: number;
    dimensions: Array<{ width: number; height: number }>;
  };
}

/**
 * Calculate comprehensive statistics for a 3D object
 * 
 * Traverses the object hierarchy and collects:
 * - Triangle/face count
 * - Vertex count
 * - Bounding box dimensions
 * - Texture information
 * 
 * @param obj - The Three.js object to analyze
 * @returns Statistics object with geometry information
 * 
 * @example
 * ```typescript
 * const stats = calculateObjectStats(model);
 * console.log(`Model has ${stats.triangles} triangles and ${stats.vertices} vertices`);
 * console.log(`Size: ${stats.bbox.x} x ${stats.bbox.y} x ${stats.bbox.z}`);
 * ```
 */
export function calculateObjectStats(obj: THREE.Object3D): GeometryStats {
  let triangles = 0;
  let vertices = 0;
  const textureSet = new Set<THREE.Texture>();

  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry;
      
      if (geometry) {
        // Count vertices
        const positionAttribute = geometry.getAttribute('position');
        if (positionAttribute) {
          vertices += positionAttribute.count;
        }

        // Count triangles
        if (geometry.index) {
          // Indexed geometry
          triangles += geometry.index.count / 3;
        } else if (positionAttribute) {
          // Non-indexed geometry
          triangles += positionAttribute.count / 3;
        }
      }

      // Collect textures from materials
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material: THREE.Material) => {
          // Check all common texture properties
          const matAny = material as any;
          const textureProps = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 
            'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap', 
            'alphaMap', 'lightMap', 'envMap'
          ];
          
          textureProps.forEach(prop => {
            if (matAny[prop] && matAny[prop] instanceof THREE.Texture) {
              textureSet.add(matAny[prop]);
            }
          });
        });
      }
    }
  });

  // Collect texture dimensions
  const textureDimensions: Array<{ width: number; height: number }> = [];
  textureSet.forEach(texture => {
    if (texture.image) {
      const width = texture.image.width || 0;
      const height = texture.image.height || 0;
      textureDimensions.push({ width, height });
    }
  });

  // Calculate bounding box dimensions
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());

  return { 
    triangles: Math.floor(triangles), 
    vertices,
    bbox: {
      x: size.x,
      y: size.y,
      z: size.z
    },
    textures: {
      count: textureSet.size,
      dimensions: textureDimensions
    }
  };
}

/**
 * Calculate the bounding box for an array of objects
 * 
 * @param objects - Array of Three.js objects
 * @returns Combined bounding box containing all objects
 * 
 * @example
 * ```typescript
 * const bbox = calculateSceneBoundingBox([model1, model2, model3]);
 * const size = bbox.getSize(new THREE.Vector3());
 * console.log(`Scene dimensions: ${size.x} x ${size.y} x ${size.z}`);
 * ```
 */
export function calculateSceneBoundingBox(objects: THREE.Object3D[]): THREE.Box3 {
  const sceneBBox = new THREE.Box3();
  
  objects.forEach(obj => {
    const objBBox = new THREE.Box3().setFromObject(obj);
    sceneBBox.union(objBBox);
  });
  
  return sceneBBox;
}

/**
 * Get the maximum dimension of a bounding box
 * 
 * @param bbox - The bounding box
 * @returns The largest dimension (x, y, or z)
 * 
 * @example
 * ```typescript
 * const bbox = new THREE.Box3().setFromObject(model);
 * const maxDim = getMaxDimension(bbox);
 * const cameraDistance = maxDim * 2; // Position camera based on size
 * ```
 */
export function getMaxDimension(bbox: THREE.Box3): number {
  const size = bbox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

/**
 * Calculate optimal camera distance to fit an object in view
 * 
 * @param objectSize - The size of the object (max dimension)
 * @param fovDegrees - Camera field of view in degrees
 * @param padding - Padding multiplier (default 1.2 = 20% padding)
 * @returns Optimal camera distance
 * 
 * @example
 * ```typescript
 * const maxDim = getMaxDimension(bbox);
 * const distance = calculateCameraDistance(maxDim, 40, 1.5);
 * camera.position.z = distance;
 * ```
 */
export function calculateCameraDistance(
  objectSize: number, 
  fovDegrees: number, 
  padding: number = 1.2
): number {
  const fovRadians = fovDegrees * (Math.PI / 180);
  const distance = (objectSize / 2) / Math.tan(fovRadians / 2);
  return distance * padding;
}

/**
 * Center an object at the origin
 * 
 * Calculates the offset needed to center an object and returns it.
 * Does not modify the object itself.
 * 
 * @param obj - The object to center
 * @returns Offset vector to apply for centering
 * 
 * @example
 * ```typescript
 * const offset = calculateCenteringOffset(model);
 * model.position.add(offset);
 * ```
 */
export function calculateCenteringOffset(obj: THREE.Object3D): THREE.Vector3 {
  const bbox = new THREE.Box3().setFromObject(obj);
  const center = bbox.getCenter(new THREE.Vector3());
  
  return new THREE.Vector3(
    -center.x,
    -bbox.min.y, // Align bottom to ground
    -center.z
  );
}

/**
 * Calculate centering offset for multiple objects
 * 
 * Centers the combined bounding box of all objects.
 * 
 * @param objects - Array of objects to center
 * @returns Offset vector to apply to all objects
 * 
 * @example
 * ```typescript
 * const offset = calculateSceneCenteringOffset([model1, model2]);
 * model1.position.add(offset);
 * model2.position.add(offset);
 * ```
 */
export function calculateSceneCenteringOffset(objects: THREE.Object3D[]): THREE.Vector3 {
  const bbox = calculateSceneBoundingBox(objects);
  const center = bbox.getCenter(new THREE.Vector3());
  
  return new THREE.Vector3(
    -center.x,
    -bbox.min.y,
    -center.z
  );
}

/**
 * Check if an object has a predefined position
 * 
 * @param position - Position array from model definition
 * @returns True if position is valid and defined
 */
export function hasValidPosition(position: number[] | undefined): boolean {
  return Array.isArray(position) && position.length === 3;
}

/**
 * Round position to specified decimal places
 * 
 * @param position - Three.js Vector3
 * @param decimals - Number of decimal places (default 3)
 * @returns Rounded position as array [x, y, z]
 * 
 * @example
 * ```typescript
 * const rounded = roundPosition(model.position, 2);
 * // [1.23, 4.56, 7.89]
 * ```
 */
export function roundPosition(position: THREE.Vector3, decimals: number = 3): [number, number, number] {
  return [
    parseFloat(position.x.toFixed(decimals)),
    parseFloat(position.y.toFixed(decimals)),
    parseFloat(position.z.toFixed(decimals))
  ];
}

/**
 * Format geometry stats as human-readable string
 * 
 * @param stats - Geometry statistics
 * @returns Formatted string with key metrics
 * 
 * @example
 * ```typescript
 * const stats = calculateObjectStats(model);
 * console.log(formatStats(stats));
 * // "42.5K triangles, 127.3K vertices, 2.5 x 3.1 x 1.8m, 3 textures"
 * ```
 */
export function formatStats(stats: GeometryStats): string {
  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${n}`;
  };
  
  const formatDimension = (d: number): string => d.toFixed(1);
  
  return `${formatNumber(stats.triangles)} triangles, ` +
         `${formatNumber(stats.vertices)} vertices, ` +
         `${formatDimension(stats.bbox.x)} x ${formatDimension(stats.bbox.y)} x ${formatDimension(stats.bbox.z)}m, ` +
         `${stats.textures.count} texture${stats.textures.count !== 1 ? 's' : ''}`;
}
