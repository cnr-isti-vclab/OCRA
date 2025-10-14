#!/bin/bash
# Three Presenter Reorganization Migration Script
# This script automates the folder reorganization to make ThreePresenter independent

set -e  # Exit on error

FRONTEND_DIR="frontend"
LIB_DIR="${FRONTEND_DIR}/src/lib/three-presenter"
ADAPTER_DIR="${FRONTEND_DIR}/src/adapters/three-presenter"
OLD_COMPONENTS_DIR="${FRONTEND_DIR}/src/components"

echo "🚀 Starting ThreePresenter reorganization..."
echo ""

# Step 1: Create new directory structure
echo "📁 Creating new directory structure..."
mkdir -p "${LIB_DIR}/src/managers"
mkdir -p "${LIB_DIR}/src/ui"
mkdir -p "${LIB_DIR}/src/utils"
mkdir -p "${LIB_DIR}/src/types"
mkdir -p "${LIB_DIR}/examples/assets"
mkdir -p "${ADAPTER_DIR}"
echo "   ✅ Directories created"
echo ""

# Step 2: Move library core files
echo "📦 Moving library files..."

if [ -f "${OLD_COMPONENTS_DIR}/ThreePresenter.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/ThreePresenter.ts" \
         "${LIB_DIR}/src/ThreePresenter.ts"
  echo "   ✅ Moved ThreePresenter.ts"
else
  echo "   ⚠️  ThreePresenter.ts not found"
fi

# Step 3: Move manager files
echo "📦 Moving manager files..."

for file in AnnotationManager.ts CameraManager.ts LightingManager.ts ModelLoader.ts; do
  if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/${file}" ]; then
    git mv "${OLD_COMPONENTS_DIR}/three-presenter/${file}" \
           "${LIB_DIR}/src/managers/${file}"
    echo "   ✅ Moved ${file}"
  else
    echo "   ⚠️  ${file} not found"
  fi
done
echo ""

# Step 4: Move UI files
echo "🎨 Moving UI files..."

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/UIControlsBuilder.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/UIControlsBuilder.ts" \
         "${LIB_DIR}/src/ui/UIControlsBuilder.ts"
  echo "   ✅ Moved UIControlsBuilder.ts"
else
  echo "   ⚠️  UIControlsBuilder.ts not found"
fi
echo ""

# Step 5: Move utility files
echo "🔧 Moving utility files..."

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/utils/GeometryUtils.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/utils/GeometryUtils.ts" \
         "${LIB_DIR}/src/utils/GeometryUtils.ts"
  echo "   ✅ Moved GeometryUtils.ts"
  rmdir "${OLD_COMPONENTS_DIR}/three-presenter/utils" 2>/dev/null || true
else
  echo "   ⚠️  GeometryUtils.ts not found"
fi
echo ""

# Step 6: Move type files
echo "📝 Moving type files..."

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/types/AnnotationTypes.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/types/AnnotationTypes.ts" \
         "${LIB_DIR}/src/types/AnnotationTypes.ts"
  echo "   ✅ Moved AnnotationTypes.ts"
else
  echo "   ⚠️  AnnotationTypes.ts not found"
fi

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/types/FileUrlResolver.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/types/FileUrlResolver.ts" \
         "${LIB_DIR}/src/types/FileUrlResolver.ts"
  echo "   ✅ Moved FileUrlResolver.ts"
else
  echo "   ⚠️  FileUrlResolver.ts not found"
fi

rmdir "${OLD_COMPONENTS_DIR}/three-presenter/types" 2>/dev/null || true
echo ""

# Step 7: Move index file
echo "📦 Moving index file..."

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/index.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/index.ts" \
         "${LIB_DIR}/src/index.ts"
  echo "   ✅ Moved index.ts"
else
  echo "   ⚠️  index.ts not found"
fi
echo ""

# Step 8: Copy shared types
echo "📋 Copying shared types..."

if [ -f "shared/scene-types.ts" ]; then
  cp "shared/scene-types.ts" \
     "${LIB_DIR}/src/types/SceneTypes.ts"
  git add "${LIB_DIR}/src/types/SceneTypes.ts"
  echo "   ✅ Copied scene-types.ts"
  echo "   ℹ️  Note: Original shared/scene-types.ts kept for backend compatibility"
else
  echo "   ⚠️  shared/scene-types.ts not found"
fi
echo ""

# Step 9: Move OCRA-specific adapter files
echo "🔌 Moving adapter files..."

if [ -f "${OLD_COMPONENTS_DIR}/three-presenter/OcraFileUrlResolver.ts" ]; then
  git mv "${OLD_COMPONENTS_DIR}/three-presenter/OcraFileUrlResolver.ts" \
         "${ADAPTER_DIR}/OcraFileUrlResolver.ts"
  echo "   ✅ Moved OcraFileUrlResolver.ts"
else
  echo "   ⚠️  OcraFileUrlResolver.ts not found"
fi

if [ -f "${OLD_COMPONENTS_DIR}/ThreeJSViewer.tsx" ]; then
  git mv "${OLD_COMPONENTS_DIR}/ThreeJSViewer.tsx" \
         "${ADAPTER_DIR}/ThreeJSViewer.tsx"
  echo "   ✅ Moved ThreeJSViewer.tsx"
else
  echo "   ⚠️  ThreeJSViewer.tsx not found"
fi
echo ""

# Step 10: Move example assets
echo "📸 Moving example assets..."

if [ -f "${FRONTEND_DIR}/examples/venus.glb" ]; then
  git mv "${FRONTEND_DIR}/examples/venus.glb" \
         "${LIB_DIR}/examples/assets/venus.glb"
  echo "   ✅ Moved venus.glb"
  rmdir "${FRONTEND_DIR}/examples" 2>/dev/null || true
else
  echo "   ⚠️  venus.glb not found"
fi
echo ""

# Step 11: Clean up old directories
echo "🧹 Cleaning up old directories..."
rmdir "${OLD_COMPONENTS_DIR}/three-presenter" 2>/dev/null || true
echo "   ✅ Cleanup complete"
echo ""

# Step 12: Create library metadata files
echo "📄 Creating library metadata files..."

# Create README.md
cat > "${LIB_DIR}/README.md" << 'EOF'
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
EOF

git add "${LIB_DIR}/README.md"
echo "   ✅ Created README.md"

# Create package.json
cat > "${LIB_DIR}/package.json" << 'EOF'
{
  "name": "three-presenter",
  "version": "0.1.0",
  "description": "Framework-agnostic 3D viewer library built on Three.js",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "docs": "typedoc"
  },
  "keywords": [
    "three.js",
    "3d-viewer",
    "webgl",
    "annotations",
    "3d-models",
    "glb",
    "ply",
    "obj",
    "nexus"
  ],
  "author": "CNR-ISTI Visual Computing Lab",
  "license": "MIT",
  "peerDependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "@types/three": "^0.180.0",
    "typescript": "^5.9.2"
  }
}
EOF

git add "${LIB_DIR}/package.json"
echo "   ✅ Created package.json"

# Create tsconfig.json
cat > "${LIB_DIR}/tsconfig.json" << 'EOF'
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "examples"]
}
EOF

git add "${LIB_DIR}/tsconfig.json"
echo "   ✅ Created tsconfig.json"

echo ""
echo "✅ Migration complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update imports in application files:"
echo "      - Run: grep -r \"from.*ThreePresenter\" frontend/src/"
echo "      - Update paths to use '../lib/three-presenter' or '../adapters/three-presenter'"
echo ""
echo "   2. Update imports in library files:"
echo "      - Fix relative paths in moved files"
echo ""
echo "   3. Test the application:"
echo "      - Run: cd frontend && npm run dev"
echo ""
echo "   4. Create standalone examples:"
echo "      - Add examples to: ${LIB_DIR}/examples/"
echo ""
echo "   5. Update documentation:"
echo "      - Update doc/THREEPRESENTER_REFACTORING.md"
echo ""
echo "   6. Commit changes:"
echo "      - Run: git status"
echo "      - Run: git commit -m 'Reorganize ThreePresenter into library structure'"
echo ""
