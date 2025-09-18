import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export default function ThreeViewer({ width = '100%', height = 400 }: { width?: string | number; height?: number | string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const dirRef = useRef<THREE.DirectionalLight | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [lightsOn, setLightsOn] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);

    const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / (typeof height === 'number' ? height : mountRef.current.clientHeight), 0.1, 1000);
    camera.position.set(2, 2, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, typeof height === 'number' ? height : mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    mountRef.current.appendChild(renderer.domElement);

    // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 7.5);
  scene.add(dir);
  // store refs so we can toggle them from UI
  ambientRef.current = ambient;
  dirRef.current = dir;

    // Cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Controls (no damping so we can render on demand)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    // Resize handling
    const onWindowResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = typeof height === 'number' ? height as number : mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      render();
    };
    window.addEventListener('resize', onWindowResize);
    // Render once and also on user interaction
    // store renderer and scene refs for external updates
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const render = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    render();

  const onControlsChange = () => render();
  controls.addEventListener('change', onControlsChange);

    // Cleanup
    return () => {
      window.removeEventListener('resize', onWindowResize);
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [height]);

  // Toggle lights on/off
  useEffect(() => {
    if (!ambientRef.current || !dirRef.current) return;
    ambientRef.current.visible = lightsOn;
    dirRef.current.visible = lightsOn;
    // re-render once to reflect lighting change
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [lightsOn]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <button
        onClick={() => setLightsOn(v => !v)}
        style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
        className="btn btn-sm btn-outline-primary"
        aria-pressed={!lightsOn}
      >
        {lightsOn ? 'Lights: On' : 'Lights: Off'}
      </button>
    </div>
  );
}
