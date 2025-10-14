/**
 * CameraManager - Manages camera setup, switching, and positioning
 * 
 * This module provides a comprehensive camera management system for Three.js scenes:
 * - Dual camera support (perspective and orthographic)
 * - Smooth camera mode switching with state preservation
 * - Automatic frustum calculation for visual consistency
 * - Camera positioning and reset functionality
 * - Resize handling for both camera types
 * 
 * @module CameraManager
 * @author OCRA Team
 */

import * as THREE from 'three';

/**
 * Configuration for camera initialization
 */
export interface CameraConfig {
  /** Field of view for perspective camera (degrees) */
  fov?: number;
  /** Near clipping plane */
  near?: number;
  /** Far clipping plane */
  far?: number;
  /** Initial frustum size for orthographic camera */
  frustumSize?: number;
  /** Initial camera position */
  initialPosition?: THREE.Vector3;
  /** Initial controls target */
  initialTarget?: THREE.Vector3;
}

/**
 * Camera state for switching between modes
 */
export interface CameraState {
  /** Camera position */
  position: THREE.Vector3;
  /** Camera rotation */
  rotation: THREE.Euler;
  /** Camera type */
  type: 'perspective' | 'orthographic';
  /** Distance to target */
  distance?: number;
  /** Target position (for controls) */
  target?: THREE.Vector3;
}

/**
 * Camera information
 */
export interface CameraInfo {
  /** Current camera type */
  type: 'perspective' | 'orthographic';
  /** Position */
  position: THREE.Vector3;
  /** Field of view (perspective only) */
  fov?: number;
  /** Frustum dimensions (orthographic only) */
  frustum?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

/**
 * CameraManager - Manages dual camera system (perspective + orthographic)
 * 
 * Example usage:
 * ```typescript
 * const cameraManager = new CameraManager(aspect, {
 *   fov: 45,
 *   initialPosition: new THREE.Vector3(0, 1, 3)
 * });
 * 
 * const camera = cameraManager.getActiveCamera();
 * 
 * // Switch camera mode
 * cameraManager.toggleCameraMode(controls);
 * 
 * // Reset to initial position
 * cameraManager.resetCamera(controls);
 * 
 * // Handle window resize
 * cameraManager.handleResize(newWidth, newHeight);
 * ```
 */
export class CameraManager {
  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthographicCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private isOrthographic: boolean = false;
  
  private initialPosition: THREE.Vector3;
  private initialTarget: THREE.Vector3;
  private frustumSize: number;
  private currentAspect: number;
  
  /**
   * Create a new CameraManager
   * 
   * @param aspect Initial aspect ratio (width / height)
   * @param config Camera configuration
   */
  constructor(aspect: number, config: CameraConfig = {}) {
    const {
      fov = 40,
      near = 0.1,
      far = 1000,
      frustumSize = 2,
      initialPosition = new THREE.Vector3(0, 0, 2),
      initialTarget = new THREE.Vector3(0, 0, 0)
    } = config;
    
    this.currentAspect = aspect;
    this.frustumSize = frustumSize;
    this.initialPosition = initialPosition.clone();
    this.initialTarget = initialTarget.clone();
    
    // Create perspective camera
    this.perspectiveCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.perspectiveCamera.position.copy(initialPosition);
    
    // Create orthographic camera
    this.orthographicCamera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      near,
      far
    );
    this.orthographicCamera.position.copy(initialPosition);
    
    // Start with perspective camera
    this.activeCamera = this.perspectiveCamera;
  }
  
  /**
   * Get the currently active camera
   */
  getActiveCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.activeCamera;
  }
  
  /**
   * Get the perspective camera
   */
  getPerspectiveCamera(): THREE.PerspectiveCamera {
    return this.perspectiveCamera;
  }
  
  /**
   * Get the orthographic camera
   */
  getOrthographicCamera(): THREE.OrthographicCamera {
    return this.orthographicCamera;
  }
  
  /**
   * Check if currently using orthographic camera
   */
  isOrthographicMode(): boolean {
    return this.isOrthographic;
  }
  
  /**
   * Get current camera type
   */
  getCameraType(): 'perspective' | 'orthographic' {
    return this.isOrthographic ? 'orthographic' : 'perspective';
  }
  
  /**
   * Get camera information
   */
  getCameraInfo(): CameraInfo {
    const info: CameraInfo = {
      type: this.getCameraType(),
      position: this.activeCamera.position.clone()
    };
    
    if (this.isOrthographic) {
      info.frustum = {
        left: this.orthographicCamera.left,
        right: this.orthographicCamera.right,
        top: this.orthographicCamera.top,
        bottom: this.orthographicCamera.bottom
      };
    } else {
      info.fov = this.perspectiveCamera.fov;
    }
    
    return info;
  }
  
  /**
   * Toggle between perspective and orthographic camera
   * 
   * @param controls Optional OrbitControls to update
   * @returns The new active camera
   */
  toggleCameraMode(controls?: any): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    // Store current camera state
    const currentPos = this.activeCamera.position.clone();
    const currentTarget = controls?.target.clone() || this.initialTarget.clone();
    const distance = currentPos.distanceTo(currentTarget);
    
    // Switch camera
    this.isOrthographic = !this.isOrthographic;
    
    if (this.isOrthographic) {
      // Switch to orthographic
      // Calculate frustum size based on perspective camera's FOV and distance
      // This ensures visual consistency when switching
      const fov = this.perspectiveCamera.fov * (Math.PI / 180); // Convert to radians
      const frustumHeight = 2 * Math.tan(fov / 2) * distance;
      const frustumWidth = frustumHeight * this.currentAspect;
      
      this.orthographicCamera.left = -frustumWidth / 2;
      this.orthographicCamera.right = frustumWidth / 2;
      this.orthographicCamera.top = frustumHeight / 2;
      this.orthographicCamera.bottom = -frustumHeight / 2;
      this.orthographicCamera.position.copy(currentPos);
      this.orthographicCamera.updateProjectionMatrix();
      
      this.activeCamera = this.orthographicCamera;
    } else {
      // Switch to perspective
      this.perspectiveCamera.position.copy(currentPos);
      this.activeCamera = this.perspectiveCamera;
    }
    
    // Update controls to use new camera
    if (controls) {
      controls.object = this.activeCamera;
      controls.target.copy(currentTarget);
      controls.update();
    }
    
    return this.activeCamera;
  }
  
  /**
   * Reset camera to initial position and target
   * 
   * @param controls Optional OrbitControls to update
   */
  resetCamera(controls?: any): void {
    this.activeCamera.position.copy(this.initialPosition);
    
    if (controls) {
      controls.target.copy(this.initialTarget);
      controls.update();
    }
  }
  
  /**
   * Set initial camera position (for reset)
   * 
   * @param position New initial position
   */
  setInitialPosition(position: THREE.Vector3): void {
    this.initialPosition.copy(position);
  }
  
  /**
   * Set initial target position (for reset)
   * 
   * @param target New initial target
   */
  setInitialTarget(target: THREE.Vector3): void {
    this.initialTarget.copy(target);
  }
  
  /**
   * Update both cameras for the current position/target
   * Useful when programmatically moving the camera
   * 
   * @param position New camera position
   * @param target New target position
   * @param controls Optional controls to update
   */
  updateCameraPosition(position: THREE.Vector3, target?: THREE.Vector3, controls?: any): void {
    this.activeCamera.position.copy(position);
    
    // Also update the inactive camera so switching is seamless
    if (this.isOrthographic) {
      this.perspectiveCamera.position.copy(position);
    } else {
      this.orthographicCamera.position.copy(position);
    }
    
    if (controls && target) {
      controls.target.copy(target);
      controls.update();
    }
  }
  
  /**
   * Handle window resize - updates both cameras
   * 
   * @param width New width in pixels
   * @param height New height in pixels
   */
  handleResize(width: number, height: number): void {
    const aspect = width / height;
    this.currentAspect = aspect;
    
    // Update perspective camera
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();
    
    // Update orthographic camera
    this.orthographicCamera.left = this.frustumSize * aspect / -2;
    this.orthographicCamera.right = this.frustumSize * aspect / 2;
    this.orthographicCamera.top = this.frustumSize / 2;
    this.orthographicCamera.bottom = this.frustumSize / -2;
    this.orthographicCamera.updateProjectionMatrix();
    
    // Update active camera reference (important for type narrowing)
    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      this.activeCamera.aspect = aspect;
    } else if (this.activeCamera instanceof THREE.OrthographicCamera) {
      this.activeCamera.left = this.frustumSize * aspect / -2;
      this.activeCamera.right = this.frustumSize * aspect / 2;
      this.activeCamera.top = this.frustumSize / 2;
      this.activeCamera.bottom = this.frustumSize / -2;
    }
    this.activeCamera.updateProjectionMatrix();
  }
  
  /**
   * Save current camera state
   * 
   * @param controls Optional controls to save target from
   * @returns CameraState object
   */
  saveCameraState(controls?: any): CameraState {
    return {
      position: this.activeCamera.position.clone(),
      rotation: this.activeCamera.rotation.clone(),
      type: this.getCameraType(),
      distance: controls ? this.activeCamera.position.distanceTo(controls.target) : undefined,
      target: controls?.target.clone()
    };
  }
  
  /**
   * Restore camera state
   * 
   * @param state CameraState to restore
   * @param controls Optional controls to update
   */
  restoreCameraState(state: CameraState, controls?: any): void {
    // Switch to correct camera type if needed
    if (state.type !== this.getCameraType()) {
      this.toggleCameraMode(controls);
    }
    
    // Restore position and rotation
    this.activeCamera.position.copy(state.position);
    this.activeCamera.rotation.copy(state.rotation);
    
    // Restore target
    if (controls && state.target) {
      controls.target.copy(state.target);
      controls.update();
    }
  }
  
  /**
   * Get the initial position
   */
  getInitialPosition(): THREE.Vector3 {
    return this.initialPosition.clone();
  }
  
  /**
   * Get the initial target
   */
  getInitialTarget(): THREE.Vector3 {
    return this.initialTarget.clone();
  }
  
  /**
   * Calculate optimal camera distance for a given bounding box
   * 
   * @param boundingBox The bounding box to frame
   * @param padding Optional padding factor (default 1.2)
   * @returns Optimal camera distance
   */
  calculateOptimalDistance(boundingBox: THREE.Box3, padding: number = 1.2): number {
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    if (this.isOrthographic) {
      return maxDim * padding;
    } else {
      const fov = this.perspectiveCamera.fov * (Math.PI / 180);
      return (maxDim / 2) / Math.tan(fov / 2) * padding;
    }
  }
  
  /**
   * Frame a bounding box - positions camera to view entire box
   * 
   * @param boundingBox The bounding box to frame
   * @param controls Optional controls to update
   * @param padding Optional padding factor (default 1.2)
   */
  frameBoundingBox(boundingBox: THREE.Box3, controls?: any, padding: number = 1.2): void {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    const distance = this.calculateOptimalDistance(boundingBox, padding);
    
    // Position camera along current direction
    const direction = new THREE.Vector3();
    this.activeCamera.getWorldDirection(direction);
    direction.multiplyScalar(-1); // Point away from target
    
    const newPosition = center.clone().add(direction.multiplyScalar(distance));
    
    this.updateCameraPosition(newPosition, center, controls);
  }
  
  /**
   * Dispose of cameras (cleanup)
   */
  dispose(): void {
    // Cameras don't have explicit dispose methods, but we can clear references
    // This is mainly for completeness
  }
}

/**
 * Utility function to create a camera manager with default settings
 * 
 * @param aspect Aspect ratio
 * @returns CameraManager instance
 */
export function createCameraManager(aspect: number): CameraManager {
  return new CameraManager(aspect);
}

/**
 * Utility function to calculate frustum size from FOV and distance
 * 
 * @param fov Field of view in degrees
 * @param distance Distance to target
 * @returns Frustum height
 */
export function calculateFrustumSize(fov: number, distance: number): number {
  const fovRadians = fov * (Math.PI / 180);
  return 2 * Math.tan(fovRadians / 2) * distance;
}
