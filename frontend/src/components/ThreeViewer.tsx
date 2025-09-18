import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export default function ThreeViewer({ width = '100%', height = 400 }: { width?: string | number; height?: number | string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

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
    const render = () => renderer.render(scene, camera);
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

  return (
    <div ref={mountRef} style={{ width, height }} />
  );
}
