import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Presenter: any;
    init3dhop: () => void;
    $: any;
  }
}

export default function ThreeDHOPViewer({ width = '100%', height = 400 }: { width?: string | number; height?: number | string }) {
  const viewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    // Initialize 3DHOP when the component mounts
    const initViewer = () => {
      if (typeof window.init3dhop === 'function' && typeof window.$ === 'function') {
        // Clear any existing content
        viewerRef.current!.innerHTML = '';

        // Create the 3DHOP structure exactly like the example
        const viewerDiv = document.createElement('div');
        viewerDiv.id = '3dhop';
        viewerDiv.className = 'tdhop';
        viewerDiv.setAttribute('onmousedown', 'if (event.preventDefault) event.preventDefault()');

        const highlightDiv = document.createElement('div');
        highlightDiv.id = 'tdhlg';
        viewerDiv.appendChild(highlightDiv);

        const canvas = document.createElement('canvas');
        canvas.id = 'draw-canvas';
        canvas.style.backgroundImage = 'url(/external/3DHOP_4.3/examples/skins/backgrounds/light.jpg)';
        viewerDiv.appendChild(canvas);

        viewerRef.current!.appendChild(viewerDiv);

        // Setup function exactly like the example
        const setup3dhop = () => {
          try {
            const presenter = new window.Presenter('draw-canvas');

            presenter.setScene({
              meshes: {
                'Gargoyle': { url: '/external/3DHOP_4.3/examples/models/gargo.ply' }
              },
              modelInstances: {
                'Model1': { mesh: 'Gargoyle' }
              }
            });
          } catch (error) {
            console.error('Failed to setup 3DHOP scene:', error);
            viewerRef.current!.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d;">Failed to load 3D model</div>';
          }
        };

        // Initialize using jQuery ready like the example
        window.$(document).ready(() => {
          window.init3dhop();
          setup3dhop();
        });

      } else {
        // 3DHOP not loaded yet, show loading message
        viewerRef.current!.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d;">Loading 3D Viewer...</div>';
      }
    };

    // Initialize 3DHOP
    if (typeof window.init3dhop === 'function' && typeof window.$ === 'function') {
      initViewer();
    } else {
      // Load 3DHOP if not already loaded
      if (!document.querySelector('script[src*="3dhop"]')) {
        // Load 3DHOP CSS
        if (!document.querySelector('link[href*="3dhop"]')) {
          const cssLink = document.createElement('link');
          cssLink.rel = 'stylesheet';
          cssLink.type = 'text/css';
          cssLink.href = '/external/3DHOP_4.3/minimal/stylesheet/3dhop.css';
          document.head.appendChild(cssLink);
        }

        // Load 3DHOP scripts in correct order (same as example)
        const scripts = [
          '/external/3DHOP_4.3/minimal/js/spidergl.js',
          '/external/3DHOP_4.3/minimal/js/jquery.js',
          '/external/3DHOP_4.3/minimal/js/presenter.js',
          '/external/3DHOP_4.3/minimal/js/nexus.js',
          '/external/3DHOP_4.3/minimal/js/ply.js',
          '/external/3DHOP_4.3/minimal/js/trackball_sphere.js',
          '/external/3DHOP_4.3/minimal/js/trackball_turntable.js',
          '/external/3DHOP_4.3/minimal/js/trackball_turntable_pan.js',
          '/external/3DHOP_4.3/minimal/js/trackball_pantilt.js',
          '/external/3DHOP_4.3/minimal/js/init.js'
        ];

        let loadedCount = 0;
        const totalScripts = scripts.length;

        const loadScript = (index: number) => {
          if (index >= totalScripts) {
            initViewer();
            return;
          }

          const script = document.createElement('script');
          script.src = scripts[index];
          script.onload = () => {
            loadedCount++;
            if (loadedCount === totalScripts) {
              initViewer();
            } else {
              loadScript(index + 1);
            }
          };
          script.onerror = () => {
            viewerRef.current!.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #dc3545;">Failed to load 3D Viewer</div>';
          };
          document.head.appendChild(script);
        };

        loadScript(0);
      }
    }

    // Cleanup function
    return () => {
      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width, height }}>
      <div ref={viewerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
