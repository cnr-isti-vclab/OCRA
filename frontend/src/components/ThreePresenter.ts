
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export interface SceneDescription {
  meshes: { [key: string]: { url: string } };
  modelInstances: { [key: string]: { mesh: string } };
  trackball?: { type: string };
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

  constructor(mount: HTMLDivElement) {
    this.mount = mount;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);
    const widthPx = mount.clientWidth;
    const heightPx = mount.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, widthPx / heightPx, 0.1, 1000);
    this.camera.position.set(0, 0, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(widthPx, heightPx);
    mount.appendChild(this.renderer.domElement);
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 2);
    this.scene.add(directionalLight);
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
    this.renderer.render(this.scene, this.camera);
  }

  setScene(sceneDesc: SceneDescription) {
    // Remove previous meshes
    Object.values(this.meshes).forEach(mesh => {
      this.scene.remove(mesh);
    });
    this.meshes = {};
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
        });
      }
      // TODO: support other formats (NXS, OBJ, etc.)
    });
  }
}
