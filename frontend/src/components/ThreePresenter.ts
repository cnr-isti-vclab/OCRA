
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { getApiBase } from '../config/oauth';

export interface SceneDescription {
  meshes: { [key: string]: { url: string } };
  modelInstances: { [key: string]: { mesh: string } };
  trackball?: { type: string };
  showGround?: boolean;
}

export class ThreePresenter {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: any;
  meshes: Record<string, THREE.Mesh> = {};
  meshDefs: Record<string, { url: string }> = {};
  modelInstances: Record<string, { mesh: string }> = {};
  mount: HTMLDivElement;
  headLight: THREE.DirectionalLight;
  ground: THREE.GridHelper | null = null;

  constructor(mount: HTMLDivElement) {
    this.mount = mount;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);
    const widthPx = mount.clientWidth;
    const heightPx = mount.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, widthPx / heightPx, 0.1, 1000);
    this.camera.position.set(0, 0, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(widthPx, heightPx);
    mount.appendChild(this.renderer.domElement);
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
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  handleResize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    // Update head light position to follow camera
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
  }

  setScene(sceneDesc: SceneDescription) {
    // Remove previous meshes
    Object.values(this.meshes).forEach(mesh => {
      this.scene.remove(mesh);
    });
    this.meshes = {};
    
    // Handle ground grid
    this.removeGround();
    if (sceneDesc.showGround) {
      this.addGround();
    }
    this.meshDefs = sceneDesc.meshes;
    this.modelInstances = sceneDesc.modelInstances;

    // Camera controls (trackball)
    if (sceneDesc.trackball && sceneDesc.trackball.type === 'TurntableTrackball') {
      import('three/examples/jsm/controls/OrbitControls').then(({ OrbitControls }) => {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 10;
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      });
    } else {
      this.controls = null;
    }

    // Track loaded meshes for scaling
    let loadedCount = 0;
    const totalMeshes = Object.keys(sceneDesc.meshes).length;

    // Load meshes
    Object.entries(sceneDesc.meshes).forEach(([meshName, meshDef]) => {
      // Construct full URL: if URL is relative, prepend API base
      const fullUrl = meshDef.url.startsWith('http') 
        ? meshDef.url 
        : `${getApiBase()}${meshDef.url}`;
      
      console.log(`Loading mesh ${meshName} from ${fullUrl}`);
      
      if (meshDef.url.endsWith('.ply')) {
        // PLY format
        const loader = new PLYLoader();
        
        // Fetch with credentials, then parse
        fetch(fullUrl, { credentials: 'include' })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.arrayBuffer();
          })
          .then(buffer => {
            const geometry = loader.parse(buffer);
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
            const mesh = new THREE.Mesh(geometry, material);
            this.meshes[meshName] = mesh;
            // Add model instances
            Object.entries(sceneDesc.modelInstances).forEach(([instName, instDef]) => {
              if (instDef.mesh === meshName) {
                this.scene.add(mesh);
              }
            });
            loadedCount++;
            console.log(`✅ Loaded PLY mesh ${meshName} - ${Object.keys(mesh.geometry.attributes).length} attributes (${loadedCount}/${totalMeshes})`);
            // Scale when all meshes are loaded
            if (loadedCount === totalMeshes) {
              this.scaleAndCenterScene();
            }
          })
          .catch(error => {
            console.error(`❌ Failed to load PLY mesh ${meshName} from ${fullUrl}:`, error);
          });
      } else if (meshDef.url.endsWith('.glb') || meshDef.url.endsWith('.gltf')) {
        // GLB/GLTF format
        const loader = new GLTFLoader();
        
        // Set up Draco decoder for compressed meshes
        const dracoLoader = new DRACOLoader();
        // Use CDN for Draco decoder (wasm files)
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder (works everywhere)
        loader.setDRACOLoader(dracoLoader);
        
        // Fetch with credentials, then parse
        fetch(fullUrl, { credentials: 'include' })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.arrayBuffer();
          })
          .then(buffer => {
            // GLTFLoader.parse expects a string path for the second argument (resource path)
            loader.parse(buffer, '', (gltf: any) => {
              // GLTF models can have multiple meshes, we'll create a group
              const group = new THREE.Group();
              gltf.scene.traverse((child: any) => {
                if ((child as THREE.Mesh).isMesh) {
                  group.add(child.clone());
                }
              });
              
              // Store as a "mesh" (actually a group) for consistency
              this.meshes[meshName] = group as any;
              
              // Add model instances
              Object.entries(sceneDesc.modelInstances).forEach(([instName, instDef]) => {
                if (instDef.mesh === meshName) {
                  this.scene.add(group);
                }
              });
              
              loadedCount++;
              console.log(`✅ Loaded GLB/GLTF mesh ${meshName} (${loadedCount}/${totalMeshes})`);
              
              // Scale when all meshes are loaded
              if (loadedCount === totalMeshes) {
                this.scaleAndCenterScene();
              }
            }, (error: any) => {
              console.error(`❌ Failed to parse GLB/GLTF mesh ${meshName}:`, error);
            });
          })
          .catch(error => {
            console.error(`❌ Failed to load GLB/GLTF mesh ${meshName} from ${fullUrl}:`, error);
          });
      } else {
        console.warn(`⚠️ Unsupported file format for ${meshName}: ${meshDef.url}`);
      }
      // TODO: support other formats (NXS, OBJ, etc.)
    });
  }

  private scaleAndCenterScene() {
    const allMeshes = Object.values(this.meshes);
    if (allMeshes.length === 0) return;
    const sceneBBox = new THREE.Box3();
    allMeshes.forEach(m => sceneBBox.expandByObject(m));
    const size = sceneBBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    console.log('Scene bounding box size:', size, 'maxDim:', maxDim);
    console.log('Camera before scaling:', this.camera.position);
    console.log('Center of bbox:', sceneBBox.getCenter(new THREE.Vector3()));
    if (maxDim > 0) {
      // Calculate scale and center
      const center = sceneBBox.getCenter(new THREE.Vector3());
      const scale = 1.0 / maxDim;
      
      // Apply scaling
      allMeshes.forEach(m => m.scale.set(scale, scale, scale));
      
      // Translate to center in X and Z, but place bottom at y=0
      // First center in X and Z
      const offsetX = -center.x * scale;
      const offsetZ = -center.z * scale;
      // For Y, translate so bottom (min.y) is at 0
      const offsetY = -sceneBBox.min.y * scale;
      
      allMeshes.forEach(m => m.position.add(new THREE.Vector3(offsetX, offsetY, offsetZ)));
      
      // Position camera to view the scene
      // Target should be at the center of the object (in XZ plane, mid-height in Y)
      const targetY = (sceneBBox.min.y + sceneBBox.max.y) * 0.5 * scale;
      this.camera.position.set(0, targetY, 2);
      if (this.controls) {
        this.controls.target.set(0, -targetY, 0);
        this.controls.update();
      }
    }
  }

  private addGround() {
    // Create a grid helper at y = 0
    // GridHelper(size, divisions, colorCenterLine, colorGrid)
    const size = 2; // 2 units wide (since we normalize to 1 unit)
    const divisions = 20; // 20x20 grid
    const colorCenterLine = 0x444444;
    const colorGrid = 0xcccccc;
    
    this.ground = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
    // GridHelper is created in XZ plane by default, which is what we want (y=0)
    this.scene.add(this.ground);
  }

  private removeGround() {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground = null;
    }
  }
}
