
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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
      // Only PLY supported for now
      if (meshDef.url.endsWith('.ply')) {
        const loader = new PLYLoader();
        loader.load(meshDef.url, (geometry: THREE.BufferGeometry) => {
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true });
          const mesh = new THREE.Mesh(geometry, material);
          this.meshes[meshName] = mesh;
          // Add model instances
          Object.entries(sceneDesc.modelInstances).forEach(([instName, instDef]) => {
            if (instDef.mesh === meshName) {
              this.scene.add(mesh);
            }
          });
          loadedCount++;
          console.log(`Loaded mesh ${meshName} (${loadedCount}/${totalMeshes})`);
          // Scale when all meshes are loaded
          if (loadedCount === totalMeshes) {
            this.scaleAndCenterScene();
          }
        });
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
      // Center the scene
      const center = sceneBBox.getCenter(new THREE.Vector3());
      const scale = 1.0 / maxDim;
      
      allMeshes.forEach(m => m.scale.set(scale, scale, scale));
      allMeshes.forEach(m => m.position.sub(center.clone().multiplyScalar(scale)));
      
      // Move camera back to fit
      this.camera.position.set(0, 0, 2);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
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
