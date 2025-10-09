import * as THREE from 'three';
import { getApiBase } from '../config/oauth';
// Note: heavy three/examples and viewport gizmo are dynamically imported where needed
import type { 
  SceneDescription, 
  ModelDefinition, 
  PresenterState
} from '../../../shared/scene-types';

export type { SceneDescription, ModelDefinition, PresenterState };

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
  camera: THREE.PerspectiveCamera;
  orthographicCamera: THREE.OrthographicCamera | null = null;
  perspectiveCamera: THREE.PerspectiveCamera;
  isOrthographic: boolean = false;
  controls: any;
  models: Record<string, THREE.Object3D> = {};  // Changed from meshes
  currentScene: SceneDescription | null = null;
  mount: HTMLDivElement;
  headLight: THREE.DirectionalLight;
  ground: THREE.GridHelper | null = null;
  homeButton: HTMLButtonElement;
  lightButton: HTMLButtonElement;
  lightPositionButton: HTMLButtonElement;
  viewportGizmo: any = null;
  envButton: HTMLButtonElement;
  screenshotButton: HTMLButtonElement;
  cameraButton: HTMLButtonElement;
  initialCameraPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 2);
  initialControlsTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  lightEnabled: boolean = true;
  envMap: THREE.Texture | null = null;
  envLightingEnabled: boolean = true;
  raycaster: THREE.Raycaster = new THREE.Raycaster();
  mouse: THREE.Vector2 = new THREE.Vector2();
  modelStats: Record<string, { triangles: number; vertices: number; bbox: { x: number; y: number; z: number }; textures: { count: number; dimensions: Array<{ width: number; height: number }> } }> = {};
  sceneBBoxSize: THREE.Vector3 = new THREE.Vector3(2, 2, 2); // Store actual scene size for ground

  constructor(mount: HTMLDivElement) {
    this.mount = mount;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x404040);
    const widthPx = mount.clientWidth;
    const heightPx = mount.clientHeight;
    const aspect = widthPx / heightPx;
    
    // Create perspective camera
    this.perspectiveCamera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    this.perspectiveCamera.position.set(0, 0, 2);
    
    // Create orthographic camera
    const frustumSize = 2;
    this.orthographicCamera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.orthographicCamera.position.set(0, 0, 2);
    
    // Start with perspective camera
    this.camera = this.perspectiveCamera;
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(widthPx, heightPx);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    mount.appendChild(this.renderer.domElement);
    
    // Load environment map
    this.loadEnvironmentMap();

    // Create a single absolute container for the action buttons so they stack vertically
    const btnContainer = document.createElement('div');
    // position at top-left of the mount. Use Bootstrap utilities for layout and spacing.
    btnContainer.className = 'position-absolute top-0 start-0 m-2 d-flex flex-column gap-2';
    btnContainer.style.zIndex = '1000';
    mount.style.position = mount.style.position || 'relative'; // ensure mount positioned for absolute children

    // Create home button
    this.homeButton = document.createElement('button');
    this.homeButton.innerHTML = '<i class="bi bi-house"></i>';
    // square compact buttons; sizing via padding + fixed min dimensions keeps them consistent
    this.homeButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.homeButton.title = 'Reset camera view';
    this.homeButton.addEventListener('mouseenter', () => { this.homeButton.style.transform = 'scale(1.05)'; });
    this.homeButton.addEventListener('mouseleave', () => { this.homeButton.style.transform = 'scale(1)'; });
    this.homeButton.addEventListener('click', () => this.resetCamera());

    // Create light toggle button
    this.lightButton = document.createElement('button');
    this.lightButton.innerHTML = '<i class="bi bi-lightbulb-fill"></i>';
    this.lightButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.lightButton.title = 'Toggle lighting';
    this.lightButton.addEventListener('mouseenter', () => { this.lightButton.style.transform = 'scale(1.05)'; });
    this.lightButton.addEventListener('mouseleave', () => { this.lightButton.style.transform = 'scale(1)'; });
    this.lightButton.addEventListener('click', () => this.toggleLight());

    // Create light position button with composed icon (sun + arrows)
    this.lightPositionButton = document.createElement('button');
    this.lightPositionButton.innerHTML = `
      <div style="position: relative; width: 16px; height: 16px;">
        <i class="bi bi-brightness-high" style="position: absolute; top: -10px; left: -4px; font-size: 24px;"></i>
        <i class="bi bi-arrows-move" style="position: absolute; font-size: 32px; top: -16px; left: -8px;"></i>
      </div>
    `;
    this.lightPositionButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.lightPositionButton.title = 'Position headlight';
    this.lightPositionButton.addEventListener('mouseenter', () => { this.lightPositionButton.style.transform = 'scale(1.05)'; });
    this.lightPositionButton.addEventListener('mouseleave', () => { this.lightPositionButton.style.transform = 'scale(1)'; });
    // TODO: Add light positioning functionality

    // Create environment lighting toggle button
    this.envButton = document.createElement('button');
    this.envButton.innerHTML = '<i class="bi bi-globe"></i>';
    this.envButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.envButton.title = 'Toggle environment lighting';
    this.envButton.addEventListener('mouseenter', () => { this.envButton.style.transform = 'scale(1.05)'; });
    this.envButton.addEventListener('mouseleave', () => { this.envButton.style.transform = 'scale(1)'; });
    this.envButton.addEventListener('click', () => this.toggleEnvLighting());

    // Create screenshot button
    this.screenshotButton = document.createElement('button');
    this.screenshotButton.innerHTML = '<i class="bi bi-camera"></i>';
    this.screenshotButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.screenshotButton.title = 'Take screenshot';
    this.screenshotButton.addEventListener('mouseenter', () => { this.screenshotButton.style.transform = 'scale(1.05)'; });
    this.screenshotButton.addEventListener('mouseleave', () => { this.screenshotButton.style.transform = 'scale(1)'; });
    this.screenshotButton.addEventListener('click', () => this.takeScreenshot());

    // Create camera mode toggle button
    this.cameraButton = document.createElement('button');
    this.cameraButton.innerHTML = '<i class="bi bi-box"></i>';
    this.cameraButton.className = 'btn btn-light p-2 shadow-sm rounded d-flex align-items-center justify-content-center';
    this.cameraButton.title = 'Toggle orthographic/perspective';
    this.cameraButton.addEventListener('mouseenter', () => { this.cameraButton.style.transform = 'scale(1.05)'; });
    this.cameraButton.addEventListener('mouseleave', () => { this.cameraButton.style.transform = 'scale(1)'; });
    this.cameraButton.addEventListener('click', () => this.toggleCameraMode());

    // Append buttons to container, then container to mount
    btnContainer.appendChild(this.homeButton);
    btnContainer.appendChild(this.lightButton);
    btnContainer.appendChild(this.lightPositionButton);
    btnContainer.appendChild(this.envButton);
    btnContainer.appendChild(this.screenshotButton);
    btnContainer.appendChild(this.cameraButton);
    mount.appendChild(btnContainer);


    // Lighting - head light setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Reduced ambient for better head light effect
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(0, 0, 1); // Initial position, will be updated
    this.scene.add(directionalLight);
    this.headLight = directionalLight;
    // Animation loop
    this.animate = this.animate.bind(this);
    this.animate();
    // Resize handler
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    // Double-click handler for recentering
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    
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
    if (this.viewportGizmo && this.viewportGizmo.dispose) {
      this.viewportGizmo.dispose();
      this.viewportGizmo = null;
    }
  }

  handleResize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    const aspect = w / h;
    
    this.renderer.setSize(w, h);
    
    // Update perspective camera
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();
    
    // Update orthographic camera
    if (this.orthographicCamera) {
      const frustumSize = 2;
      this.orthographicCamera.left = frustumSize * aspect / -2;
      this.orthographicCamera.right = frustumSize * aspect / 2;
      this.orthographicCamera.top = frustumSize / 2;
      this.orthographicCamera.bottom = frustumSize / -2;
      this.orthographicCamera.updateProjectionMatrix();
    }
    
    // Update current camera reference
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    
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
      console.log('🎯 Recentering camera on point:', intersectionPoint);

      // Smoothly animate the controls target to the intersection point
      this.animateCameraTarget(intersectionPoint);
    }
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
    
    // Update head light position - light follows camera exactly
    if (this.headLight) {
      this.headLight.position.copy(this.camera.position);
      // Point the light towards the scene center (or controls target)
      if (this.controls && this.controls.target) {
        this.headLight.lookAt(this.controls.target);
      } else {
        this.headLight.lookAt(0, 0, 0);
      }
    }
    
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
    // Construct the full URL for the model file
    let fullUrl: string;
    if (modelDef.file.startsWith('http')) {
      // Absolute URL
      fullUrl = modelDef.file;
    } else {
      // Relative filename - construct URL using projectId from scene
      const projectId = this.currentScene?.projectId;
      if (!projectId) {
        throw new Error(`Cannot load model ${modelDef.id}: no projectId in scene description`);
      }
      fullUrl = `${getApiBase()}/api/projects/${projectId}/files/${encodeURIComponent(modelDef.file)}`;
    }
    
    console.log(`Loading model ${modelDef.id} from ${fullUrl}`);
    
    try {
      const model = await this.loadModelFile(fullUrl, modelDef);
      
      // Apply transforms (position, rotation, scale)
      this.applyTransforms(model, modelDef);
      if (modelDef.visible !== undefined) {
        model.visible = modelDef.visible;
      }
      
      // Calculate and store model statistics
      this.modelStats[modelDef.id] = this.calculateObjectStats(model);
      console.log(`📊 Model ${modelDef.id} stats:`, this.modelStats[modelDef.id]);
      
      // Store and add to scene
      this.models[modelDef.id] = model;
      this.scene.add(model);
      
      console.log(`✅ Loaded model ${modelDef.id}`);
    } catch (error) {
      console.error(`❌ Failed to load model ${modelDef.id}:`, error);
      throw error;
    }
  }

  /**
   * Load a model file based on its extension
   */
  private async loadModelFile(url: string, modelDef: ModelDefinition): Promise<THREE.Object3D> {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    
    const filename = modelDef.file.toLowerCase();
    
    if (filename.endsWith('.ply')) {
      return this.parsePLY(buffer, modelDef);
    } else if (filename.endsWith('.glb') || filename.endsWith('.gltf')) {
      return this.parseGLTF(buffer, modelDef);
    } else {
      throw new Error(`Unsupported file format: ${modelDef.file}`);
    }
  }

  /**
   * Parse PLY file
   */
  private async parsePLY(buffer: ArrayBuffer, modelDef: ModelDefinition): Promise<THREE.Mesh> {
    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader');
    const loader = new PLYLoader();
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();

    // Create material with optional overrides
    const materialProps: any = {
      color: modelDef.material?.color || 0xdddddd,
      flatShading: modelDef.material?.flatShading ?? true,
    };
    if (modelDef.material?.metalness !== undefined) {
      materialProps.metalness = modelDef.material.metalness;
    }
    if (modelDef.material?.roughness !== undefined) {
      materialProps.roughness = modelDef.material.roughness;
    }

    const material = new THREE.MeshStandardMaterial(materialProps);
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  /**
   * Parse GLTF/GLB file
   */
  private async parseGLTF(buffer: ArrayBuffer, modelDef: ModelDefinition): Promise<THREE.Group> {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader'),
      import('three/examples/jsm/loaders/DRACOLoader')
    ]);

    const loader = new GLTFLoader();

    // Set up Draco decoder
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);

    return await new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(buffer, '', (gltf: any) => {
        const group = new THREE.Group();
        gltf.scene.traverse((child: any) => {
          if ((child as THREE.Mesh).isMesh) {
            const clonedChild = child.clone();

            // Apply material overrides if specified
            if (modelDef.material && (clonedChild as THREE.Mesh).material) {
              const mat = (clonedChild as THREE.Mesh).material as THREE.Material;
              if ((mat as any).color && modelDef.material.color) {
                (mat as any).color = new THREE.Color(modelDef.material.color);
              }
              if ((mat as any).metalness !== undefined && modelDef.material.metalness !== undefined) {
                (mat as any).metalness = modelDef.material.metalness;
              }
              if ((mat as any).roughness !== undefined && modelDef.material.roughness !== undefined) {
                (mat as any).roughness = modelDef.material.roughness;
              }
            }

            group.add(clonedChild);
          }
        });
        resolve(group);
      }, (error: any) => {
        reject(error);
      });
    });
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
        fov: this.camera.fov,
      },
      rendering: {
        headLightEnabled: this.lightEnabled,
        envLightingEnabled: this.envLightingEnabled,
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
    if (state.camera.fov) {
      this.camera.fov = state.camera.fov;
      this.camera.updateProjectionMatrix();
    }
    
    // Restore rendering settings
    this.lightEnabled = state.rendering.headLightEnabled;
    if (this.headLight) {
      this.headLight.intensity = this.lightEnabled ? 0.9 : 0;
      this.lightButton.innerHTML = this.lightEnabled ? '<i class="bi bi-lightbulb-fill"></i>' : '<i class="bi bi-lightbulb"></i>';
    }
    
    this.envLightingEnabled = state.rendering.envLightingEnabled;
    this.scene.environment = this.envLightingEnabled ? this.envMap : null;
    this.envButton.innerHTML = this.envLightingEnabled ? '<i class="bi bi-globe"></i>' : '<i class="bi bi-circle"></i>';
    
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

  private scaleAndCenterScene() {
    // Deprecated - now handled by frameScene()
    this.frameScene();
  }

  resetCamera() {
    // Reset camera to initial position
    this.camera.position.copy(this.initialCameraPosition);
    if (this.controls) {
      this.controls.target.copy(this.initialControlsTarget);
      this.controls.update();
    }
    console.log('📷 Camera view reset to home position');
  }

  toggleLight() {
    this.lightEnabled = !this.lightEnabled;
    if (this.headLight) {
      this.headLight.intensity = this.lightEnabled ? 0.9 : 0;
      this.lightButton.innerHTML = this.lightEnabled ? '<i class="bi bi-lightbulb-fill"></i>' : '<i class="bi bi-lightbulb"></i>';
      console.log(`💡 Lighting ${this.lightEnabled ? 'enabled' : 'disabled'}`);
    }
  }

  toggleEnvLighting() {
    this.envLightingEnabled = !this.envLightingEnabled;
    this.scene.environment = this.envLightingEnabled ? this.envMap : null;
    this.envButton.innerHTML = this.envLightingEnabled ? '<i class="bi bi-globe"></i>' : '<i class="bi bi-circle"></i>';
    console.log(`🌍 Environment lighting ${this.envLightingEnabled ? 'enabled' : 'disabled'}`);
  }

  toggleCameraMode() {
    if (!this.orthographicCamera) return;
    
    // Store current camera state
    const currentPos = this.camera.position.clone();
    const currentTarget = this.controls?.target.clone() || new THREE.Vector3(0, 0, 0);
    const distance = currentPos.distanceTo(currentTarget);
    
    // Switch camera
    this.isOrthographic = !this.isOrthographic;
    
    if (this.isOrthographic) {
      // Switch to orthographic
      const aspect = this.mount.clientWidth / this.mount.clientHeight;
      
      // Calculate frustum size based on perspective camera's FOV and distance
      // This ensures visual consistency when switching
      const fov = this.perspectiveCamera.fov * (Math.PI / 180); // Convert to radians
      const frustumHeight = 2 * Math.tan(fov / 2) * distance;
      const frustumWidth = frustumHeight * aspect;
      
      this.orthographicCamera.left = -frustumWidth / 2;
      this.orthographicCamera.right = frustumWidth / 2;
      this.orthographicCamera.top = frustumHeight / 2;
      this.orthographicCamera.bottom = -frustumHeight / 2;
      this.orthographicCamera.position.copy(currentPos);
      this.orthographicCamera.updateProjectionMatrix();
      
      this.camera = this.orthographicCamera as any;
      this.cameraButton.style.opacity = '0.7';
      console.log('📦 Switched to orthographic camera');
    } else {
      // Switch to perspective
      this.perspectiveCamera.position.copy(currentPos);
      this.camera = this.perspectiveCamera;
      this.cameraButton.style.opacity = '1';
      console.log('📐 Switched to perspective camera');
    }
    
    // Update controls to use new camera
    if (this.controls) {
      this.controls.object = this.camera;
      this.controls.target.copy(currentTarget);
      this.controls.update();
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

  /**
   * Calculate statistics (triangles, vertices, bounding box, textures) for a Three.js object
   */
  private calculateObjectStats(obj: THREE.Object3D): { triangles: number; vertices: number; bbox: { x: number; y: number; z: number }; textures: { count: number; dimensions: Array<{ width: number; height: number }> } } {
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
            const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'envMap'];
            
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
          this.envMap = texture;
          this.scene.environment = texture;
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
}
