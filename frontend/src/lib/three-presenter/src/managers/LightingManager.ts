import * as THREE from 'three';

/**
 * Configuration for lighting setup
 */
export interface LightingConfig {
  /** Initial intensity for ambient light (default: 0.1) */
  ambientIntensity?: number;
  /** Initial intensity for directional head light (default: 0.9) */
  headLightIntensity?: number;
  /** Color of lights (default: 0xffffff) */
  lightColor?: number;
  /** Initial head light offset in radians [horizontal, vertical] (default: [0, 0]) */
  initialOffset?: THREE.Vector2;
}

/**
 * Current state of lighting system
 */
export interface LightingState {
  /** Whether head light is enabled */
  headLightEnabled: boolean;
  /** Whether environment lighting is enabled */
  envLightingEnabled: boolean;
  /** Current head light intensity */
  headLightIntensity: number;
  /** Current angular offset [horizontal, vertical] in radians */
  headLightOffset: THREE.Vector2;
}

/**
 * LightingManager handles all lighting for the 3D scene.
 * 
 * Features:
 * - Ambient lighting for base illumination
 * - Directional head light that follows camera
 * - Environment map lighting support
 * - Configurable head light offset (angular position relative to camera)
 * - Toggle controls for head light and environment lighting
 * 
 * The head light uses a sophisticated offset system:
 * - headLightOffset.x: horizontal angle (theta) in radians (positive → rotate right)
 * - headLightOffset.y: vertical angle (phi) in radians (positive → rotate up)
 * - Offset is relative to camera direction, maintaining consistent distance
 * 
 * @example
 * ```typescript
 * const manager = new LightingManager(scene, {
 *   ambientIntensity: 0.1,
 *   headLightIntensity: 0.9
 * });
 * 
 * // In animation loop
 * manager.updateHeadLight(camera, controls.target);
 * 
 * // Toggle lighting
 * manager.toggleHeadLight();
 * manager.toggleEnvironmentLighting();
 * ```
 */
export class LightingManager {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight;
  private headLight: THREE.DirectionalLight;
  private headLightOffset: THREE.Vector2;
  private headLightEnabled: boolean = true;
  private envLightingEnabled: boolean = true;
  private envMap: THREE.Texture | null = null;
  private config: Required<LightingConfig>;

  /**
   * Create a new lighting manager
   * @param scene The Three.js scene to add lights to
   * @param config Configuration options for lighting
   */
  constructor(scene: THREE.Scene, config: LightingConfig = {}) {
    this.scene = scene;
    
    // Set defaults
    this.config = {
      ambientIntensity: config.ambientIntensity ?? 0.1,
      headLightIntensity: config.headLightIntensity ?? 0.9,
      lightColor: config.lightColor ?? 0xffffff,
      initialOffset: config.initialOffset ?? new THREE.Vector2(0, 0)
    };

    // Create ambient light
    this.ambientLight = new THREE.AmbientLight(
      this.config.lightColor,
      this.config.ambientIntensity
    );
    this.scene.add(this.ambientLight);

    // Create directional head light
    this.headLight = new THREE.DirectionalLight(
      this.config.lightColor,
      this.config.headLightIntensity
    );
    this.headLight.position.set(0, 0, 1); // Initial position
    this.scene.add(this.headLight);

    // Initialize offset
    this.headLightOffset = this.config.initialOffset.clone();
  }

  /**
   * Update head light position based on camera position and controls target.
   * This should be called in the animation loop for smooth tracking.
   * 
   * The head light maintains a fixed angular offset from the camera direction,
   * following the camera while respecting the configured offset angles.
   * 
   * @param camera The active camera
   * @param target The point the camera is looking at (typically controls.target)
   */
  updateHeadLight(camera: THREE.Camera, target: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): void {
    if (!this.headLight) return;

    // Apply angular offset to position head light relative to camera
    this.applyHeadLightOffset(camera, target);

    // Point the light towards the target
    this.headLight.lookAt(target);
  }

  /**
   * Apply the angular headLightOffset to compute headLight position relative to camera.
   * 
   * Algorithm:
   * 1. Get camera direction in spherical coordinates (theta, phi)
   * 2. Add offset angles
   * 3. Convert back to Cartesian coordinates
   * 4. Maintain same distance from target as camera
   * 
   * @param camera The active camera
   * @param target The point to position relative to
   */
  private applyHeadLightOffset(camera: THREE.Camera, target: THREE.Vector3): void {
    if (!this.headLight) return;

    // Base camera direction (from target to camera)
    const camDir = new THREE.Vector3()
      .subVectors(camera.position, target)
      .normalize();

    // Convert camDir to spherical coordinates
    // thetaCam: azimuth around Y axis, phiCam: polar angle from Y axis
    const thetaCam = Math.atan2(camDir.x, camDir.z);
    const phiCam = Math.acos(Math.max(-1, Math.min(1, camDir.y))); // Clamp to [0, PI]

    // Apply offsets
    const theta = thetaCam + this.headLightOffset.x;
    const phi = Math.max(0.01, Math.min(Math.PI - 0.01, phiCam + this.headLightOffset.y));

    // Distance: keep same distance from target as camera
    const camDistance = camera.position.distanceTo(target);

    // Convert back to Cartesian
    const r = camDistance;
    const x = target.x + r * Math.sin(phi) * Math.sin(theta);
    const y = target.y + r * Math.cos(phi);
    const z = target.z + r * Math.sin(phi) * Math.cos(theta);

    this.headLight.position.set(x, y, z);
  }

  /**
   * Set the head light angular offset.
   * 
   * @param offset Angular offset [horizontal, vertical] in radians
   *   - x (horizontal): positive = rotate right
   *   - y (vertical): positive = rotate up
   */
  setHeadLightOffset(offset: THREE.Vector2): void {
    this.headLightOffset.copy(offset);
  }

  /**
   * Set the head light offset from degrees (convenience method).
   * Useful when loading from configuration files that store degrees.
   * 
   * @param horizontalDegrees Horizontal angle in degrees
   * @param verticalDegrees Vertical angle in degrees
   */
  setHeadLightOffsetFromDegrees(horizontalDegrees: number, verticalDegrees: number): void {
    const degToRad = Math.PI / 180;
    this.headLightOffset.set(
      horizontalDegrees * degToRad,
      verticalDegrees * degToRad
    );
  }

  /**
   * Get the current head light offset in radians
   */
  getHeadLightOffset(): THREE.Vector2 {
    return this.headLightOffset.clone();
  }

  /**
   * Toggle head light on/off
   * @returns New state (true = enabled, false = disabled)
   */
  toggleHeadLight(): boolean {
    this.headLightEnabled = !this.headLightEnabled;
    this.headLight.intensity = this.headLightEnabled ? this.config.headLightIntensity : 0;
    return this.headLightEnabled;
  }

  /**
   * Set head light enabled state
   * @param enabled Whether to enable the head light
   */
  setHeadLightEnabled(enabled: boolean): void {
    this.headLightEnabled = enabled;
    this.headLight.intensity = enabled ? this.config.headLightIntensity : 0;
  }

  /**
   * Check if head light is enabled
   */
  isHeadLightEnabled(): boolean {
    return this.headLightEnabled;
  }

  /**
   * Set the head light intensity
   * @param intensity Light intensity (0 to 1+)
   */
  setHeadLightIntensity(intensity: number): void {
    this.config.headLightIntensity = intensity;
    if (this.headLightEnabled) {
      this.headLight.intensity = intensity;
    }
  }

  /**
   * Set the environment map for IBL (Image-Based Lighting)
   * @param envMap The environment texture or null to clear
   */
  setEnvironmentMap(envMap: THREE.Texture | null): void {
    this.envMap = envMap;
    if (this.envLightingEnabled) {
      this.scene.environment = envMap;
    }
  }

  /**
   * Toggle environment lighting on/off
   * @returns New state (true = enabled, false = disabled)
   */
  toggleEnvironmentLighting(): boolean {
    this.envLightingEnabled = !this.envLightingEnabled;
    this.scene.environment = this.envLightingEnabled ? this.envMap : null;
    return this.envLightingEnabled;
  }

  /**
   * Set environment lighting enabled state
   * @param enabled Whether to enable environment lighting
   */
  setEnvironmentLightingEnabled(enabled: boolean): void {
    this.envLightingEnabled = enabled;
    this.scene.environment = enabled ? this.envMap : null;
  }

  /**
   * Check if environment lighting is enabled
   */
  isEnvironmentLightingEnabled(): boolean {
    return this.envLightingEnabled;
  }

  /**
   * Get the current lighting state
   */
  getState(): LightingState {
    return {
      headLightEnabled: this.headLightEnabled,
      envLightingEnabled: this.envLightingEnabled,
      headLightIntensity: this.headLight.intensity,
      headLightOffset: this.headLightOffset.clone()
    };
  }

  /**
   * Get the ambient light object
   */
  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Get the directional head light object
   */
  getHeadLight(): THREE.DirectionalLight {
    return this.headLight;
  }

  /**
   * Set ambient light intensity
   * @param intensity Light intensity (0 to 1+)
   */
  setAmbientIntensity(intensity: number): void {
    this.config.ambientIntensity = intensity;
    this.ambientLight.intensity = intensity;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }
    if (this.headLight) {
      this.scene.remove(this.headLight);
      this.headLight.dispose();
    }
  }
}
