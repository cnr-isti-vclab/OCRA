/**
 * Type declarations for nexus3d
 * Nexus is a multiresolution 3D model streaming library
 * @see https://www.npmjs.com/package/nexus3d
 * @see https://vcg.isti.cnr.it/nexus/
 */

declare module 'nexus3d' {
  import * as THREE from 'three';

  /**
   * NexusObject - A Three.js Mesh that handles streaming multiresolution 3D data
   */
  export class NexusObject extends THREE.Mesh {
    /**
     * Create a new Nexus streaming object
     * @param url - URL to the .nxs or .nxz file
     * @param onLoad - Optional callback when model is loaded
     * @param onUpdate - Optional callback when model is updated (new data streamed)
     * @param onError - Optional error callback
     */
    constructor(
      url: string,
      onLoad?: () => void,
      onUpdate?: () => void,
      onError?: (error: Error) => void
    );

    /**
     * Update method - should be called in render loop for streaming
     * @param camera - Three.js camera for LOD calculation
     */
    update(camera: THREE.Camera): void;

    /**
     * Destroy and clean up resources
     */
    destroy(): void;
  }

  /**
   * Default export - the Nexus module
   */
  const Nexus: {
    NexusObject: typeof NexusObject;
    onLoad?: () => void;
    onUpdate?: () => void;
  };

  export default Nexus;
}
