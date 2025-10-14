# ThreePresenter

A framework-agnostic 3D viewer library built on Three.js.

## Overview

ThreePresenter is an independent, reusable 3D visualization library that provides:

- 🎨 Multi-format 3D model loading (GLB, PLY, OBJ, NXS)
- 📍 Annotation system (points, lines, areas)
- 📷 Camera controls (perspective/orthographic)
- 💡 Lighting & environment management
- 🎛️ UI controls builder
- 📸 Screenshot capture
- 🔧 Extensible architecture

## Features

### Core Capabilities
- Framework-agnostic (works with React, Vue, vanilla JS)
- TypeScript support with full type definitions
- Automatic model centering and scaling
- Interactive camera controls (OrbitControls)
- Environment lighting with HDRI support
- Ground plane with customizable grid

### Annotation System
- Point annotations with sphere markers
- Line annotations with connected paths
- Area annotations with filled polygons
- Click-to-pick 3D points
- Multi-selection support

### File Format Support
- GLB/GLTF (PBR materials)
- PLY (point clouds, meshes)
- OBJ (with MTL materials)
- NXS (Nexus multiresolution)

## Installation

Currently bundled with OCRA. Future: available on npm.

```bash
npm install three-presenter
```

## Quick Start

### Basic Usage

```typescript
import { ThreePresenter } from 'three-presenter';

// Create viewer
const viewer = new ThreePresenter(document.getElementById('viewer'));

// Load scene
await viewer.loadScene({
  projectId: 'my-project',
  models: [
    {
      id: 'model1',
      filename: 'model.glb',
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1
    }
  ],
  environment: {
    background: '#404040',
    groundVisible: true,
    hdriPath: 'environment.exr'
  }
});

// Control visibility
viewer.setModelVisibility('model1', false);

// Cleanup
viewer.dispose();
```

### Custom URL Resolver

```typescript
import { ThreePresenter, StaticBaseUrlResolver } from 'three-presenter';

const viewer = new ThreePresenter(
  container,
  new StaticBaseUrlResolver('https://cdn.example.com/models/')
);
```

### Annotations

```typescript
// Render annotations
viewer.getAnnotationManager().renderAnnotations([
  {
    id: 'point1',
    label: 'Feature A',
    type: 'point',
    geometry: [0, 1, 0],
    color: '#ff0000'
  }
]);

// Enable point picking
viewer.getAnnotationManager().setOnPointPicked((point) => {
  console.log('Picked point:', point);
});
```

## API Reference

See [API Documentation](../../docs/api/) for complete reference.

## Examples

See the `examples/` directory for standalone demos:
- `basic.html` - Minimal setup
- `advanced.html` - Full features
- `custom-resolver.html` - Custom URL resolution

## Architecture

ThreePresenter uses a modular architecture:

```
src/
├── ThreePresenter.ts       # Main orchestrator
├── managers/               # Subsystems
│   ├── AnnotationManager.ts
│   ├── CameraManager.ts
│   ├── LightingManager.ts
│   └── ModelLoader.ts
├── ui/                     # UI components
│   └── UIControlsBuilder.ts
├── utils/                  # Utilities
│   └── GeometryUtils.ts
└── types/                  # Type definitions
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

MIT

## Credits

Developed by CNR-ISTI Visual Computing Lab for the OCRA project.
