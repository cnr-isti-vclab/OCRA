import * as THREE from 'three';
import { AnnotationManager } from './managers/AnnotationManager';
import type { FileUrlResolver } from './types/FileUrlResolver';
import { StaticBaseUrlResolver } from './types/FileUrlResolver';
import { calculateObjectStats, type GeometryStats } from './utils/GeometryUtils';
import { UIControlsBuilder, type ButtonConfig } from './ui/UIControlsBuilder';
import { CameraManager, type CameraConfig } from './managers/CameraManager';
import { LightingManager } from './managers/LightingManager';
import { ModelLoader } from './managers/ModelLoader';
// Note: heavy three/examples and viewport gizmo are dynamically imported where needed
import type { 
  SceneDescription, 
  ModelDefinition, 
  PresenterState,
  Annotation
} from './types/SceneTypes';

export type { SceneDescription, ModelDefinition, PresenterState };
export { AnnotationManager };

/**
 * Progress information for model loading
 */
export interface LoadingProgress {
  modelId: string;
  fileName: string;
  loaded: number;
  total: number;
  percentage: number;
  status: 'loading' | 'parsing' | 'complete' | 'error';
}

/**
 * ThreePresenter - Main 3D Scene Presenter Component
 * 
 * Manages the complete 3D viewing experience including model loading, rendering,
 * camera controls, lighting, and user interactions.
 * 
 * @description
 * This class is responsible for:
 * - Loading and displaying 3D models from scene.json configuration
 * - Managing Three.js scene, camera, renderer, and controls
 * - Providing UI controls (visibility, lighting, camera reset, screenshots)
 * - Handling model transformations (position, rotation, scale)
 * - Supporting multiple 3D file formats (GLB, PLY, OBJ, etc.)
 * - Auto-centering and normalizing model sizes
 * 
 * @example
 * ```typescript
 * const presenter = new ThreePresenter(mountElement);
 * await presenter.loadScene(sceneDescription);
 * presenter.setModelVisibility('model_id', false);
 * ```
 * 
 * @see {@link /doc/SCENE_JSON_FORMAT.md} for scene.json format documentation
 */
export class ThreePresenter {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  orthographicCamera: THREE.OrthographicCamera | null = null;
  perspectiveCamera: THREE.PerspectiveCamera;
  isOrthographic: boolean = false;
  controls: any;
  models: Record<string, THREE.Object3D> = {};  // Changed from meshes
  currentScene: SceneDescription | null = null;
  mount: HTMLDivElement;
  ground: THREE.GridHelper | null = null;
  homeButton: HTMLButtonElement;
  lightButton: HTMLButtonElement;
  lightPositionButton: HTMLButtonElement;
  viewportGizmo: any = null;
  envButton: HTMLButtonElement;
  screenshotButton: HTMLButtonElement;
  cameraButton: HTMLButtonElement;
  annotationButton: HTMLButtonElement;
  isPickingMode: boolean = false;
  onPointPicked: ((point: [number, number, number]) => void) | null = null;
  initialCameraPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 2);
  initialControlsTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  lightEnabled: boolean = true;
  raycaster: THREE.Raycaster = new THREE.Raycaster();
  mouse: THREE.Vector2 = new THREE.Vector2();
  modelStats: Record<string, GeometryStats> = {};
  sceneBBoxSize: THREE.Vector3 = new THREE.Vector3(2, 2, 2); // Store actual scene size for ground
  
  // File URL resolver for loading models
  private fileUrlResolver: FileUrlResolver;
  
  // Loading progress callbacks
  onLoadProgress?: (progress: LoadingProgress) => void;
  onLoadComplete?: (modelId: string) => void;
  onLoadError?: (modelId: string, error: Error) => void;
  
  // Managers
  private annotationManager: AnnotationManager;
  private cameraManager: CameraManager;
  private lightingManager: LightingManager;
  private modelLoader: ModelLoader;

  constructor(mount: HTMLDivElement | string, fileUrlResolver?: FileUrlResolver) {
    // Support both element and element ID
    if (typeof mount === 'string') {
      const element = document.getElementById(mount);
      if (!element) {
        throw new Error(`Element with ID "${mount}" not found`);
      }
      this.mount = element as HTMLDivElement;
    } else {
      this.mount = mount;
    }
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x404040);
    const widthPx = this.mount.clientWidth;
    const heightPx = this.mount.clientHeight;
    const aspect = widthPx / heightPx;
    
    // Initialize file URL resolver (use StaticBaseUrlResolver with './assets' as default)
    // This makes standalone examples work out-of-the-box
    this.fileUrlResolver = fileUrlResolver || new StaticBaseUrlResolver('./assets');
    
    // Create camera manager
    this.cameraManager = new CameraManager(aspect, {
      fov: 40,
      near: 0.1,
      far: 1000,
      frustumSize: 2,
      initialPosition: new THREE.Vector3(0, 0, 2),
      initialTarget: new THREE.Vector3(0, 0, 0)
    });
    
    // Get cameras from manager
    this.perspectiveCamera = this.cameraManager.getPerspectiveCamera();
    this.orthographicCamera = this.cameraManager.getOrthographicCamera();
    this.camera = this.cameraManager.getActiveCamera();
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(widthPx, heightPx);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.mount.appendChild(this.renderer.domElement);
    
    // Initialize annotation manager
    this.annotationManager = new AnnotationManager(this.scene, {
      color: 0xffff00,
      selectedColor: 0xffff66,
      markerSize: 10
    });
    
    // Load environment map
    this.loadEnvironmentMap();

    // Create UI controls using UIControlsBuilder
    // All buttons are hidden by default - use setButtonVisible() to show them
    const buttonConfigs: ButtonConfig[] = [
      {
        id: 'home',
        icon: 'bi-house',
        title: 'Reset camera view',
        onClick: () => this.resetCamera(),
        visible: false
      },
      {
        id: 'light',
        icon: 'bi-lightbulb-fill',
        title: 'Toggle lighting',
        onClick: () => this.toggleLight(),
        visible: false
      },
      {
        id: 'lightPosition',
        icon: 'bi-brightness-high', // Will be overridden by customHTML
        customHTML: `
          <div style="position: relative; width: 16px; height: 16px;">
            <i class="bi bi-brightness-high" style="position: absolute; top: -10px; left: -4px; font-size: 24px;"></i>
            <i class="bi bi-arrows-move" style="position: absolute; font-size: 32px; top: -16px; left: -8px;"></i>
          </div>
        `,
        title: 'Position headlight',
        onClick: () => {}, // TODO: Add light positioning functionality
        visible: false
      },
      {
        id: 'env',
        icon: 'bi-globe',
        title: 'Toggle environment lighting',
        onClick: () => this.toggleEnvLighting(),
        visible: false
      },
      {
        id: 'screenshot',
        icon: 'bi-camera',
        title: 'Take screenshot',
        onClick: () => this.takeScreenshot(),
        visible: false
      },
      {
        id: 'camera',
        icon: 'bi-box',
        title: 'Toggle orthographic/perspective',
        onClick: () => this.toggleCameraMode(),
        visible: false
      },
      {
        id: 'annotation',
        icon: 'bi-pencil',
        title: 'Add annotation',
        onClick: () => this.togglePickingMode(),
        visible: false
      }
    ];

    const controlsBuilder = new UIControlsBuilder();
    const uiControls = controlsBuilder
      .setContainer({
        position: 'top-left',
        direction: 'vertical',
        gap: 'gap-2',
        zIndex: '1000'
      })
      .addButtons(buttonConfigs)
      .build();

    // Store button references
    this.homeButton = uiControls.buttons.get('home')!;
    this.lightButton = uiControls.buttons.get('light')!;
    this.lightPositionButton = uiControls.buttons.get('lightPosition')!;
    this.envButton = uiControls.buttons.get('env')!;
    this.screenshotButton = uiControls.buttons.get('screenshot')!;
    this.cameraButton = uiControls.buttons.get('camera')!;
    this.annotationButton = uiControls.buttons.get('annotation')!;

    // Append UI controls to mount
    this.mount.style.position = this.mount.style.position || 'relative'; // ensure mount positioned for absolute children
    this.mount.appendChild(uiControls.container);


    // Lighting setup
    this.lightingManager = new LightingManager(this.scene, {
      ambientIntensity: 0.1,
      headLightIntensity: 0.9,
      lightColor: 0xffffff,
      initialOffset: new THREE.Vector2(0, 0)
    });
    
    // Model loading setup
    this.modelLoader = new ModelLoader({
      dracoDecoderPath: 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
      autoComputeNormals: true,
      defaultMaterial: {
        color: 0xdddddd,
        flatShading: true
      }
    });
    
    // Animation loop
    this.animate = this.animate.bind(this);
    this.animate();
    // Resize handler
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    // Double-click handler for recentering
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
    // Click handler for annotation selection
    this.handleClick = this.handleClick.bind(this);
    this.renderer.domElement.addEventListener('click', this.handleClick);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    
    // Dispose managers
    this.annotationManager.dispose();
    this.lightingManager.dispose();
    this.modelLoader.dispose();
    
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.homeButton.parentNode) {
      this.homeButton.parentNode.removeChild(this.homeButton);
    }
    if (this.lightButton.parentNode) {
      this.lightButton.parentNode.removeChild(this.lightButton);
    }
    if (this.lightPositionButton.parentNode) {
      this.lightPositionButton.parentNode.removeChild(this.lightPositionButton);
    }
    if (this.envButton.parentNode) {
      this.envButton.parentNode.removeChild(this.envButton);
    }
    if (this.screenshotButton.parentNode) {
      this.screenshotButton.parentNode.removeChild(this.screenshotButton);
    }
    if (this.annotationButton.parentNode) {
      this.annotationButton.parentNode.removeChild(this.annotationButton);
    }
    if (this.viewportGizmo && this.viewportGizmo.dispose) {
      this.viewportGizmo.dispose();
      this.viewportGizmo = null;
    }
  }

  handleResize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    
    this.renderer.setSize(w, h);
    
    // Use camera manager to handle resize for both cameras
    this.cameraManager.handleResize(w, h);
    
    // Update camera reference
    this.camera = this.cameraManager.getActiveCamera();
    
    if (this.controls) this.controls.update(); 
    if (this.viewportGizmo) this.viewportGizmo.update();
  }

  /**
   * Handle double-click on the canvas to recenter the camera on the clicked point
   */
  handleDoubleClick(event: MouseEvent) {
    if (!this.controls) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Get all model objects for raycasting
    const modelObjects: THREE.Object3D[] = [];
    Object.values(this.models).forEach(model => {
      // Recursively collect all meshes in the model
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          modelObjects.push(child);
        }
      });
    });

    // Check for intersections
    const intersects = this.raycaster.intersectObjects(modelObjects, false);

    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      
      // If in picking mode, notify callback and exit picking mode
      if (this.isPickingMode) {
        const coords: [number, number, number] = [
          intersectionPoint.x,
          intersectionPoint.y,
          intersectionPoint.z
        ];
        console.log('📍 Picked 3D point:', coords.map(v => v.toFixed(4)));
        
        // Call the callback if set
        if (this.onPointPicked) {
          this.onPointPicked(coords);
        }
        
        this.exitPickingMode();
        return;
      }
      
      // Otherwise, recenter camera on point
      console.log('🎯 Recentering camera on point:', intersectionPoint);
      this.animateCameraTarget(intersectionPoint);
    }
  }

  /**
   * Handle single click for annotation selection
   */
  handleClick(event: MouseEvent) {
    // Don't handle clicks while in picking mode
    if (this.annotationManager.isPickingMode()) return;
    
    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with annotation markers
    const markerObjects = this.annotationManager.getAllMarkers();
    const intersects = this.raycaster.intersectObjects(markerObjects, false);

    if (intersects.length > 0) {
      // Find which annotation was clicked
      const clickedMarker = intersects[0].object as THREE.Mesh;
      const clickedAnnotationId = this.annotationManager.getAnnotationIdFromMarker(clickedMarker);

      if (clickedAnnotationId) {
        // Toggle selection with Ctrl/Cmd for multi-select, otherwise single select
        if (event.ctrlKey || event.metaKey) {
          this.annotationManager.toggleSelection(clickedAnnotationId);
        } else {
          this.annotationManager.select([clickedAnnotationId], false); // Replace selection
        }
      }
    } else {
      // Clicked on empty space - clear selection if not using modifier keys
      if (!event.ctrlKey && !event.metaKey) {
        this.annotationManager.clearSelection();
      }
    }
  }

  /**
   * Toggle picking mode for annotation placement
   */
  togglePickingMode() {
    if (this.isPickingMode) {
      this.exitPickingMode();
    } else {
      this.enterPickingMode();
    }
  }

  /**
   * Enter picking mode
   */
  private enterPickingMode() {
    this.isPickingMode = true;
    this.renderer.domElement.style.cursor = 'crosshair';
    this.annotationButton.style.backgroundColor = '#0d6efd'; // Bootstrap primary blue
    this.annotationButton.style.color = 'white';
    console.log('✏️ Entered picking mode - double-click on model to pick a point');
  }

  /**
   * Exit picking mode
   */
  private exitPickingMode() {
    this.isPickingMode = false;
    this.renderer.domElement.style.cursor = 'auto';
    this.annotationButton.style.backgroundColor = '';
    this.annotationButton.style.color = '';
    console.log('✅ Exited picking mode');
  }

  /**
   * Smoothly animate the camera controls target to a new position
   */
  private animateCameraTarget(targetPosition: THREE.Vector3) {
    if (!this.controls) return;

    const startTarget = this.controls.target.clone();
    const endTarget = targetPosition.clone();
    const duration = 500; // milliseconds
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate between start and end
      this.controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  animate() {
    requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    
    // Update head light position to follow camera
    const target = (this.controls && this.controls.target) 
      ? this.controls.target 
      : new THREE.Vector3(0, 0, 0);
    this.lightingManager.updateHeadLight(this.camera, target);
    
    // Update annotation marker scales to maintain constant screen space size
    this.annotationManager.updateMarkerScales(this.camera, this.renderer.domElement.clientHeight);
    
    // Update Nexus objects for multiresolution streaming
    this.scene.traverse((object: THREE.Object3D) => {
      if ((object as any).update && typeof (object as any).update === 'function') {
        // NexusObject has an update method that needs the camera
        (object as any).update(this.camera);
      }
    });
    
    this.renderer.render(this.scene, this.camera);

    // Render viewport gizmo if present
    if (this.viewportGizmo && typeof this.viewportGizmo.render === 'function') {
      this.viewportGizmo.render();
    }
  }

  /**
   * Load a new scene description
   * @param sceneDesc Scene description
   * @param preserveCamera If true, keeps current camera position instead of reframing
   */
  async loadScene(sceneDesc: SceneDescription, preserveCamera: boolean = false): Promise<void> {
    try {
      // Save current camera state if preserving
      let savedCameraPos: THREE.Vector3 | null = null;
      let savedCameraTarget: THREE.Vector3 | null = null;
      if (preserveCamera && this.controls) {
        savedCameraPos = this.camera.position.clone();
        savedCameraTarget = this.controls.target.clone();
        console.log('📷 Preserving camera position during scene reload');
      }
      
      this.currentScene = sceneDesc;

      // Clear existing scene
      this.clearScene();

      // Apply environment settings
      if (sceneDesc.environment) {
        this.applyEnvironmentSettings(sceneDesc.environment);
      }

      // Setup controls if enabled
      if (sceneDesc.enableControls !== false) {
        await this.setupControls();
      }

      // Load all models
      if (sceneDesc.models && sceneDesc.models.length > 0) {
        await this.loadAllModels(sceneDesc.models);
        
        if (!preserveCamera) {
          this.frameScene();
        } else {
          // Update scene bbox size for ground without reframing camera
          const sceneBBox = new THREE.Box3();
          Object.values(this.models).forEach(m => sceneBBox.expandByObject(m));
          const size = sceneBBox.getSize(new THREE.Vector3());
          this.sceneBBoxSize.copy(size);
        }
        
        // Recreate ground with correct size after framing scene
        if (sceneDesc.environment?.showGround) {
          this.removeGround();
          this.addGround();
        }
      }
      
      // Restore camera position if preserved
      if (preserveCamera && savedCameraPos && savedCameraTarget && this.controls) {
        this.camera.position.copy(savedCameraPos);
        this.controls.target.copy(savedCameraTarget);
        this.controls.update();
        console.log('📷 Camera position restored after scene reload');
      }

      // Render annotations if present
      if (sceneDesc.annotations && sceneDesc.annotations.length > 0) {
        this.annotationManager.render(sceneDesc.annotations);
      }

      console.log('✅ Scene loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load scene:', error);
      throw error;
    }
  }

  /**
   * Clear all models from the scene
   */
  private clearScene(): void {
    Object.values(this.models).forEach(model => {
      this.scene.remove(model);
    });
    this.models = {};
  }

  /**
   * Apply transforms from ModelDefinition to a loaded Object3D
   * - position: [x,y,z]
   * - rotation: [x,y,z] in radians or degrees (auto-detect)
   * - scale: single number or [x,y,z]
   */
  private applyTransforms(model: THREE.Object3D, def: ModelDefinition) {
    // Position
    if (def.position && def.position.length === 3) {
      model.position.set(def.position[0], def.position[1], def.position[2]);
    }

    // Rotation - prefer explicit units (def.rotationUnits -> scene rotationUnits), otherwise auto-detect
    if (def.rotation && def.rotation.length === 3) {
      const r = def.rotation;
      const sceneUnits = this.currentScene?.rotationUnits;
      const units = def.rotationUnits || sceneUnits || null; // 'deg' | 'rad' | null
      let rx = r[0], ry = r[1], rz = r[2];
      if (units === 'deg') {
        const degToRad = Math.PI / 180;
        rx = r[0] * degToRad;
        ry = r[1] * degToRad;
        rz = r[2] * degToRad;
      } else if (units === 'rad') {
        // use as-is
      } else {
        // auto-detect degrees if values are large (> 2π)
        const maxAbs = Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2]));
        const twoPi = Math.PI * 2;
        if (maxAbs > twoPi + 0.0001) {
          const degToRad = Math.PI / 180;
          rx = r[0] * degToRad;
          ry = r[1] * degToRad;
          rz = r[2] * degToRad;
        }
      }
      model.rotation.set(rx, ry, rz);
    }

    // Scale - accept number or vec3
    if (def.scale !== undefined) {
      if (typeof def.scale === 'number') {
        model.scale.set(def.scale, def.scale, def.scale);
      } else if (Array.isArray(def.scale) && def.scale.length === 3) {
        model.scale.set(def.scale[0], def.scale[1], def.scale[2]);
      }
    }
  }

  /**
   * Apply environment settings (ground, background)
   */
  private applyEnvironmentSettings(env: any): void {
    // Handle ground grid
    this.removeGround();
    if (env.showGround) {
      this.addGround();
    }
    
    // Handle background color
    if (env.background) {
      this.scene.background = new THREE.Color(env.background);
    }

    // Handle head light offset (stored in degrees in scene JSON)
    if (env.headLightOffset && Array.isArray(env.headLightOffset) && env.headLightOffset.length >= 2) {
      this.lightingManager.setHeadLightOffsetFromDegrees(
        env.headLightOffset[0] || 0,
        env.headLightOffset[1] || 0
      );
      // Immediately apply so the headlight is positioned correctly
      const target = this.controls?.target || new THREE.Vector3(0, 0, 0);
      this.lightingManager.updateHeadLight(this.camera, target);
    }
  }

  /**
   * Setup orbit controls and viewport gizmo
   */
  private async setupControls(): Promise<void> {
    if (this.controls) return; // Already setup
    
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    // Initial limits - will be updated after scene is loaded
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // Create and attach ViewportGizmo (dynamically import to avoid bundling it always)
    if (!this.viewportGizmo) {
      try {
        const { ViewportGizmo } = await import('three-viewport-gizmo');
        this.viewportGizmo = new ViewportGizmo(this.camera, this.renderer, {
          container: this.mount,
          size: 80
        });
        if (this.viewportGizmo.attachControls) this.viewportGizmo.attachControls(this.controls);
        console.log('✅ ViewportGizmo created and attached to controls');
      } catch (err) {
        console.warn('⚠️ Failed to load viewport gizmo dynamically:', err);
      }
    }
  }

  /**
   * Load all models from the scene description
   */
  private async loadAllModels(modelDefs: ModelDefinition[]): Promise<void> {
    const loadPromises = modelDefs.map(modelDef => this.loadModel(modelDef));
    await Promise.all(loadPromises);
  }

  /**
   * Load a single model
   */
  private async loadModel(modelDef: ModelDefinition): Promise<void> {
    // Use the file URL resolver to get the full URL
    const projectId = this.currentScene?.projectId;
    const fullUrl = this.fileUrlResolver.resolve(modelDef.file, { projectId });
    
    console.log(`Loading model ${modelDef.id} from ${fullUrl}`);
    
    try {
      // Notify loading started
      this.onLoadProgress?.({
        modelId: modelDef.id,
        fileName: modelDef.file,
        loaded: 0,
        total: 0,
        percentage: 0,
        status: 'loading'
      });
      
      const model = await this.loadModelFile(fullUrl, modelDef);
      
      // Apply transforms (position, rotation, scale)
      this.applyTransforms(model, modelDef);
      if (modelDef.visible !== undefined) {
        model.visible = modelDef.visible;
      }
      
      // Calculate and store model statistics
      this.modelStats[modelDef.id] = calculateObjectStats(model);
      console.log(`📊 Model ${modelDef.id} stats:`, this.modelStats[modelDef.id]);
      
      // Store and add to scene
      this.models[modelDef.id] = model;
      this.scene.add(model);
      
      console.log(`✅ Loaded model ${modelDef.id}`);
      
      // Notify completion
      this.onLoadProgress?.({
        modelId: modelDef.id,
        fileName: modelDef.file,
        loaded: 0,
        total: 0,
        percentage: 100,
        status: 'complete'
      });
      this.onLoadComplete?.(modelDef.id);
    } catch (error) {
      console.error(`❌ Failed to load model ${modelDef.id}:`, error);
      
      // Notify error
      this.onLoadProgress?.({
        modelId: modelDef.id,
        fileName: modelDef.file,
        loaded: 0,
        total: 0,
        percentage: 0,
        status: 'error'
      });
      this.onLoadError?.(modelDef.id, error as Error);
      
      throw error;
    }
  }

  /**
   * Load a model file based on its extension
   */
  private async loadModelFile(url: string, modelDef: ModelDefinition): Promise<THREE.Object3D> {
    // Use the ModelLoader to handle format detection and loading
    const materialOverrides = modelDef.material ? {
      color: modelDef.material.color ? parseInt(modelDef.material.color.replace('#', ''), 16) : undefined,
      flatShading: modelDef.material.flatShading,
      metalness: modelDef.material.metalness,
      roughness: modelDef.material.roughness
    } : undefined;

    // Create progress callback
    const onProgress = (loaded: number, total: number, percentage: number) => {
      this.onLoadProgress?.({
        modelId: modelDef.id,
        fileName: modelDef.file,
        loaded,
        total,
        percentage,
        status: 'loading'
      });
    };

    const result = await this.modelLoader.loadFromUrl(url, materialOverrides, onProgress);
    console.log(`📦 Loaded ${result.format.toUpperCase()} model (${(result.byteSize / 1024).toFixed(2)} KB)`);
    
    return result.object;
  }

  /**
   * Frame the scene - position models and camera without scaling
   * Models without predefined positions are translated so:
   * - Bottom of bbox is at y=0
   * - Center of X and Z axes are at origin
   * Camera is positioned at appropriate distance based on scene size
   */
  private frameScene(): void {
    const allModels = Object.values(this.models);
    if (allModels.length === 0) return;
    
    // Calculate scene bounding box to determine camera position and ground size
    const sceneBBox = new THREE.Box3();
    allModels.forEach(m => sceneBBox.expandByObject(m));
    const size = sceneBBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('Scene bounding box size (original):', size, 'maxDim:', maxDim);
    
    // Store scene size for ground sizing
    this.sceneBBoxSize.copy(size);
    
    if (maxDim > 0) {
      const center = sceneBBox.getCenter(new THREE.Vector3());
      
      // Calculate translation needed to center scene
      const offsetX = -center.x;
      const offsetZ = -center.z;
      const offsetY = -sceneBBox.min.y;
      
      // Apply automatic positioning only to models without predefined positions
      allModels.forEach((model, idx) => {
        if (this.currentScene?.models) {
          const modelDef = this.currentScene.models[idx];
          if (modelDef) {
            // Only apply automatic positioning if position is not already defined
            if (!modelDef.position || modelDef.position.length !== 3) {
              const translation = new THREE.Vector3(offsetX, offsetY, offsetZ);
              model.position.add(translation);
              
              // Store the computed position in the model definition (rounded to 3 decimals)
              const pos = model.position;
              modelDef.position = [
                parseFloat(pos.x.toFixed(3)),
                parseFloat(pos.y.toFixed(3)),
                parseFloat(pos.z.toFixed(3))
              ];
              console.log(`📍 Model ${modelDef.id} auto-positioned to:`, modelDef.position);
            } else {
              console.log(`📍 Model ${modelDef.id} using predefined position:`, modelDef.position);
            }
          }
        }
      });
      
      // Position camera at appropriate distance based on scene size
      // Use a distance that fits the entire scene in view
      const fov = this.perspectiveCamera.fov * (Math.PI / 180); // Convert to radians
      const cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
      const targetY = size.y * 0.5;
      
      // Add some padding (1.2x distance)
      const finalDistance = cameraDistance * 1.2;
      
      this.camera.position.set(0, targetY, finalDistance);
      if (this.controls) {
        this.controls.target.set(0, targetY, 0);
        // Set reasonable zoom limits based on scene size
        this.controls.minDistance = maxDim * 0.1;
        this.controls.maxDistance = maxDim * 10;
        this.controls.update();
      }
      
      // Update orthographic camera frustum if it exists
      if (this.orthographicCamera) {
        const aspect = this.mount.clientWidth / this.mount.clientHeight;
        const frustumHeight = maxDim;
        const frustumWidth = frustumHeight * aspect;
        this.orthographicCamera.left = -frustumWidth / 2;
        this.orthographicCamera.right = frustumWidth / 2;
        this.orthographicCamera.top = frustumHeight / 2;
        this.orthographicCamera.bottom = -frustumHeight / 2;
        this.orthographicCamera.position.set(0, targetY, finalDistance);
        this.orthographicCamera.updateProjectionMatrix();
      }
      
      // Store initial position
      this.initialCameraPosition.copy(this.camera.position);
      this.initialControlsTarget.set(0, targetY, 0);
      
      // Update camera manager's initial values
      this.cameraManager.setInitialPosition(this.camera.position);
      this.cameraManager.setInitialTarget(new THREE.Vector3(0, targetY, 0));
      
      console.log(`📷 Camera positioned at distance ${finalDistance.toFixed(2)}, target height ${targetY.toFixed(2)}`);
    }
  }

  /**
   * Get current presenter state (for saving/persistence)
   */
  getState(): PresenterState {
    return {
      camera: {
        position: this.camera.position.toArray() as [number, number, number],
        target: this.controls?.target.toArray() as [number, number, number] || [0, 0, 0],
        fov: this.camera instanceof THREE.PerspectiveCamera ? this.camera.fov : 45,
      },
      rendering: {
        headLightEnabled: this.lightEnabled,
        envLightingEnabled: this.lightingManager.isEnvironmentLightingEnabled(),
      },
      modelVisibility: this.getModelVisibility(),
    };
  }

  /**
   * Apply transformations to a specific model without saving to scene
   * Useful for live preview while editing
   */
  applyModelTransform(
    modelId: string,
    position?: [number, number, number] | null,
    rotation?: [number, number, number] | null,
    scale?: number | [number, number, number] | null
  ): void {
    const model = this.models[modelId];
    if (!model) {
      console.warn(`Model ${modelId} not found`);
      return;
    }

    // Apply position
    if (position && position.length === 3) {
      model.position.set(position[0], position[1], position[2]);
    }

    // Apply rotation (always in radians for Three.js)
    if (rotation && rotation.length === 3) {
      model.rotation.set(rotation[0], rotation[1], rotation[2]);
    }

    // Apply scale
    if (scale !== undefined && scale !== null) {
      if (typeof scale === 'number') {
        model.scale.set(scale, scale, scale);
      } else if (Array.isArray(scale) && scale.length === 3) {
        model.scale.set(scale[0], scale[1], scale[2]);
      }
    }
  }

  /**
   * Restore presenter state (from saved/persistence)
   */
  setState(state: PresenterState): void {
    // Restore camera
    this.camera.position.fromArray(state.camera.position);
    if (this.controls) {
      this.controls.target.fromArray(state.camera.target);
      this.controls.update();
    }
    if (state.camera.fov && this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.fov = state.camera.fov;
      this.camera.updateProjectionMatrix();
    }
    
    // Restore rendering settings
    this.lightEnabled = state.rendering.headLightEnabled;
    this.lightingManager.setHeadLightEnabled(this.lightEnabled);
    this.lightButton.innerHTML = this.lightEnabled ? '<i class="bi bi-lightbulb-fill"></i>' : '<i class="bi bi-lightbulb"></i>';
    
    this.lightingManager.setEnvironmentLightingEnabled(state.rendering.envLightingEnabled);
    this.envButton.innerHTML = state.rendering.envLightingEnabled ? '<i class="bi bi-globe"></i>' : '<i class="bi bi-circle"></i>';
    
    // Restore model visibility
    for (const [modelId, visible] of Object.entries(state.modelVisibility)) {
      this.setModelVisibility(modelId, visible);
    }
  }

  /**
   * Set visibility of a model by ID
   */
  setModelVisibility(modelId: string, visible: boolean): void {
    const model = this.models[modelId];
    if (model) {
      model.visible = visible;
      console.log(`👁️ Model '${modelId}' visibility set to ${visible}`);
    } else {
      console.warn(`⚠️ Model '${modelId}' not found in loaded models. Available models:`, Object.keys(this.models));
    }
  }

  /**
   * Get visibility of a specific model
   */
  getModelVisibilityById(modelId: string): boolean {
    const model = this.models[modelId];
    return model ? model.visible : false;
  }

  /**
   * Get visibility of all models
   */
  private getModelVisibility(): Record<string, boolean> {
    const visibility: Record<string, boolean> = {};
    for (const [id, model] of Object.entries(this.models)) {
      visibility[id] = model.visible;
    }
    return visibility;
  }

  /**
   * Get the annotation manager instance for direct access to annotation API
   * @returns The AnnotationManager instance
   */
  getAnnotationManager(): AnnotationManager {
    return this.annotationManager;
  }

  /**
   * Set background color without reloading the scene
   * @param color Hex color string (e.g., '#404040')
   */
  setBackgroundColor(color: string): void {
    this.scene.background = new THREE.Color(color);
    // Update currentScene if it exists
    if (this.currentScene && this.currentScene.environment) {
      this.currentScene.environment.background = color;
    }
    console.log('🎨 Background color updated to:', color);
  }

  /**
   * Toggle ground visibility without reloading the scene
   * @param visible Whether the ground should be visible
   */
  setGroundVisible(visible: boolean): void {
    if (visible && !this.ground) {
      this.addGround();
    } else if (!visible && this.ground) {
      this.removeGround();
    }
    // Update currentScene if it exists
    if (this.currentScene && this.currentScene.environment) {
      this.currentScene.environment.showGround = visible;
    }
    console.log('🌍 Ground visibility set to:', visible);
  }

  /**
   * Set head light offset without reloading the scene
   * @param thetaDeg Horizontal angle in degrees
   * @param phiDeg Vertical angle in degrees
   */
  setHeadLightOffset(thetaDeg: number, phiDeg: number): void {
    this.lightingManager.setHeadLightOffsetFromDegrees(thetaDeg, phiDeg);
    const target = this.controls?.target || new THREE.Vector3(0, 0, 0);
    this.lightingManager.updateHeadLight(this.camera, target);
    // Update currentScene if it exists
    if (this.currentScene && this.currentScene.environment) {
      if (!this.currentScene.environment.headLightOffset) {
        this.currentScene.environment.headLightOffset = [0, 0];
      }
      this.currentScene.environment.headLightOffset[0] = thetaDeg;
      this.currentScene.environment.headLightOffset[1] = phiDeg;
    }
    console.log('💡 Head light offset updated to:', thetaDeg, phiDeg);
  }

  resetCamera() {
    // Use camera manager to reset camera
    this.cameraManager.resetCamera(this.controls);
    console.log('📷 Camera view reset to home position');
  }

  toggleLight() {
    this.lightEnabled = this.lightingManager.toggleHeadLight();
    this.lightButton.innerHTML = this.lightEnabled ? '<i class="bi bi-lightbulb-fill"></i>' : '<i class="bi bi-lightbulb"></i>';
    console.log(`💡 Lighting ${this.lightEnabled ? 'enabled' : 'disabled'}`);
  }

  toggleEnvLighting() {
    const enabled = this.lightingManager.toggleEnvironmentLighting();
    this.envButton.innerHTML = enabled ? '<i class="bi bi-globe"></i>' : '<i class="bi bi-circle"></i>';
    console.log(`🌍 Environment lighting ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Show or hide the annotation button
   */
  setAnnotationButtonVisible(visible: boolean) {
    this.annotationButton.style.display = visible ? 'flex' : 'none';
    // Exit picking mode when hiding the button
    if (!visible && this.isPickingMode) {
      this.exitPickingMode();
    }
  }

  /**
   * Show or hide a specific UI button
   * @param buttonName - Name of the button: 'home', 'light', 'lightPosition', 'env', 'screenshot', 'camera', 'annotation'
   * @param visible - true to show, false to hide
   */
  setButtonVisible(buttonName: string, visible: boolean) {
    const buttonMap: { [key: string]: HTMLButtonElement } = {
      home: this.homeButton,
      light: this.lightButton,
      lightPosition: this.lightPositionButton,
      env: this.envButton,
      screenshot: this.screenshotButton,
      camera: this.cameraButton,
      annotation: this.annotationButton
    };

    const button = buttonMap[buttonName];
    if (button) {
      button.style.display = visible ? 'flex' : 'none';
      // Exit picking mode when hiding annotation button
      if (buttonName === 'annotation' && !visible && this.isPickingMode) {
        this.exitPickingMode();
      }
    } else {
      console.warn(`Unknown button name: ${buttonName}. Valid options: ${Object.keys(buttonMap).join(', ')}`);
    }
  }

  /**
   * Show or hide all UI buttons at once
   */
  setAllButtonsVisible(visible: boolean) {
    this.homeButton.style.display = visible ? 'flex' : 'none';
    this.lightButton.style.display = visible ? 'flex' : 'none';
    this.lightPositionButton.style.display = visible ? 'flex' : 'none';
    this.envButton.style.display = visible ? 'flex' : 'none';
    this.screenshotButton.style.display = visible ? 'flex' : 'none';
    this.cameraButton.style.display = visible ? 'flex' : 'none';
    this.annotationButton.style.display = visible ? 'flex' : 'none';
    
    if (!visible && this.isPickingMode) {
      this.exitPickingMode();
    }
  }

  toggleCameraMode() {
    if (!this.orthographicCamera) return;
    
    // Use camera manager to toggle camera mode
    this.camera = this.cameraManager.toggleCameraMode(this.controls);
    this.isOrthographic = this.cameraManager.isOrthographicMode();
    
    // Update button opacity
    if (this.isOrthographic) {
      this.cameraButton.style.opacity = '0.7';
      console.log('📦 Switched to orthographic camera');
    } else {
      this.cameraButton.style.opacity = '1';
      console.log('📐 Switched to perspective camera');
    }
    
    // Dispose and recreate viewport gizmo with the new camera
    this.recreateViewportGizmo();
  }

  async recreateViewportGizmo() {
    // Dispose existing gizmo
    if (this.viewportGizmo && this.viewportGizmo.dispose) {
      try {
        this.viewportGizmo.dispose();
        console.log('🗑️ Disposed old viewport gizmo');
      } catch (err) {
        console.warn('Failed to dispose viewport gizmo:', err);
      }
      this.viewportGizmo = null;
    }
    
    // Create new gizmo with current camera
    try {
      const { ViewportGizmo } = await import('three-viewport-gizmo');
      this.viewportGizmo = new ViewportGizmo(this.camera, this.renderer, {
        container: this.mount,
        size: 80
      });
      if (this.viewportGizmo.attachControls && this.controls) {
        this.viewportGizmo.attachControls(this.controls);
      }
      console.log('✅ Recreated viewport gizmo with new camera');
    } catch (err) {
      console.warn('⚠️ Failed to recreate viewport gizmo:', err);
    }
  }

  takeScreenshot() {
    // Render the current frame to ensure we have the latest state
    this.renderer.render(this.scene, this.camera);
    
    // Get the canvas data as a data URL (PNG format)
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `screenshot-${timestamp}.png`;
    link.href = dataURL;
    link.click();
    
    console.log('📸 Screenshot captured and downloaded');
  }

  /**
   * Calculate triangle and vertex counts for a loaded model
   * @param modelId - The ID of the model to analyze
   * @returns Object with triangle and vertex counts, or null if model not found
   */
  getModelStats(modelId: string): { triangles: number; vertices: number; bbox: { x: number; y: number; z: number }; textures: { count: number; dimensions: Array<{ width: number; height: number }> } } | null {
    return this.modelStats[modelId] || null;
  }

  private addGround() {
    // Create a grid helper at y = 0, sized based on actual scene dimensions
    // GridHelper(size, divisions, colorCenterLine, colorGrid)
    const maxDim = Math.max(this.sceneBBoxSize.x, this.sceneBBoxSize.z);
    const size = maxDim * 2; // Make ground 2x the scene size for context
    const divisions = Math.max(10, Math.min(50, Math.floor(size / 0.1))); // Adaptive divisions
    const colorCenterLine = 0xdddddd;
    const colorGrid = 0x888888;
    
    this.ground = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
    // GridHelper is created in XZ plane by default, which is what we want (y=0)
    this.scene.add(this.ground);
    console.log(`🌍 Ground grid created: size=${size.toFixed(2)}, divisions=${divisions}`);
  }

  private removeGround() {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground = null;
    }
  }

  private async loadEnvironmentMap() {
    try {
      // Dynamically import EXRLoader
      // @ts-ignore - example loaders may not have types in the project
      const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader');
      const exrLoader = new EXRLoader();
      // Load from public folder
      exrLoader.load(
        '/brown_photostudio_02_1k.exr',
        (texture: THREE.DataTexture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.lightingManager.setEnvironmentMap(texture);
          console.log('✅ Environment map loaded successfully');
        },
        undefined,
        (error: any) => {
          console.error('❌ Failed to load environment map:', error);
        }
      );
    } catch (err) {
      console.warn('EXRLoader dynamic import failed or not available:', err);
    }
  }

  /**
   * Selection management methods for annotations
   */

  /**
   * Selection management methods (delegate to AnnotationManager)
   */
}
