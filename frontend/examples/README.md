# Using ThreePresenter in a Standalone HTML Page

This directory contains examples of how to use ThreePresenter outside of the main OCRA application.

## Current Architecture

ThreePresenter is built with TypeScript and ES modules, with the following dependencies:
- Three.js (3D rendering)
- Multiple modular components (AnnotationManager, CameraManager, etc.)
- Scene type definitions from shared/

## Options for Standalone Usage

### Option 1: Build a UMD Bundle (Recommended)

Create a standalone JavaScript bundle that can be used with a `<script>` tag.

1. **Create a build configuration** (`vite.config.standalone.ts`):

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/ThreePresenter.ts'),
      name: 'ThreePresenter',
      fileName: 'three-presenter',
      formats: ['umd', 'es']
    },
    rollupOptions: {
      external: ['three'],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    }
  }
});
```

2. **Build the bundle**:

```bash
npm run build -- --config vite.config.standalone.ts
```

3. **Use in HTML**:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"></script>
  <script src="./dist/three-presenter.umd.js"></script>
</head>
<body>
  <div id="viewer"></div>
  <script>
    const container = document.getElementById('viewer');
    const presenter = new ThreePresenter.ThreePresenter(container);
    
    presenter.loadScene({
      models: [{ id: 'model1', file: 'model.glb' }],
      environment: { backgroundColor: '#2a2a2a' }
    });
  </script>
</body>
</html>
```

### Option 2: Use ES Modules with Import Maps

Modern browsers support ES modules directly.

```html
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div id="viewer"></div>
  <script type="module">
    // Would need bundled ES module
    import { ThreePresenter } from './dist/three-presenter.es.js';
    
    const container = document.getElementById('viewer');
    const presenter = new ThreePresenter(container);
    await presenter.loadScene({ /* ... */ });
  </script>
</body>
</html>
```

### Option 3: Use Existing Build with Module Bundler

If you're building another application, you can import ThreePresenter directly:

```typescript
import { ThreePresenter } from '@ocra/frontend/components/ThreePresenter';

const container = document.getElementById('viewer');
const presenter = new ThreePresenter(container);
```

## Creating a Production Build

### Step 1: Add Build Script

Add to `package.json`:

```json
{
  "scripts": {
    "build:standalone": "vite build --config vite.config.standalone.ts"
  }
}
```

### Step 2: Create Standalone Config

Create `vite.config.standalone.ts`:

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist-standalone',
    lib: {
      entry: resolve(__dirname, 'src/components/ThreePresenter.ts'),
      name: 'OcraThreePresenter',
      fileName: (format) => `three-presenter.${format}.js`,
      formats: ['umd', 'es', 'iife']
    },
    rollupOptions: {
      // Externalize Three.js (load from CDN)
      external: ['three'],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared')
    }
  }
});
```

### Step 3: Build

```bash
npm run build:standalone
```

This creates:
- `dist-standalone/three-presenter.umd.js` - For `<script>` tags
- `dist-standalone/three-presenter.es.js` - For modern ES modules
- `dist-standalone/three-presenter.iife.js` - For immediate invocation

## Minimal Working Example

See `standalone-viewer.html` for a complete example showing:
- ✅ HTML structure
- ✅ Three.js from CDN
- ✅ Basic scene setup
- ✅ Error handling
- ✅ Loading states

## API Usage

Once you have ThreePresenter loaded, the API is the same:

```javascript
// Create presenter
const presenter = new ThreePresenter(container);

// Load a scene
await presenter.loadScene({
  models: [
    { id: 'model1', file: 'model.glb', title: 'My Model' }
  ],
  environment: {
    backgroundColor: '#2a2a2a',
    groundVisible: true
  },
  annotations: []
});

// Control the scene
presenter.setBackgroundColor('#ffffff');
presenter.setModelVisibility('model1', false);
presenter.setGroundVisible(true);

// Work with annotations
const annotationMgr = presenter.getAnnotationManager();
annotationMgr.render([
  { id: 'pt1', label: 'Point 1', type: 'point', geometry: [0, 0, 0] }
]);

// Handle transforms
presenter.applyModelTransform('model1', {
  position: [1, 2, 3],
  rotation: [0, 90, 0],
  scale: [1, 1, 1]
});
```

## Scene Description Format

ThreePresenter expects a scene description object:

```typescript
interface SceneDescription {
  models: Array<{
    id: string;
    file: string;          // "model.glb", "mesh.ply", etc.
    title?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    visible?: boolean;
  }>;
  
  environment?: {
    backgroundColor?: string;
    groundVisible?: boolean;
    headLightOffset?: [number, number];  // [theta, phi] in degrees
  };
  
  annotations?: Array<{
    id: string;
    label: string;
    type: 'point' | 'line' | 'area';
    geometry: [number, number, number] | [number, number, number][];
  }>;
}
```

## File URL Resolution

ThreePresenter uses a `FileUrlResolver` to locate model files. For standalone usage:

```javascript
class SimpleFileUrlResolver {
  constructor(baseUrl = './models/') {
    this.baseUrl = baseUrl;
  }
  
  resolveModelUrl(filename) {
    return this.baseUrl + filename;
  }
  
  resolveTextureUrl(filename) {
    return this.baseUrl + filename;
  }
}

const presenter = new ThreePresenter(
  container,
  new SimpleFileUrlResolver('https://my-cdn.com/models/')
);
```

## Supported File Formats

ThreePresenter supports these 3D formats:
- `.glb` / `.gltf` - Recommended (includes materials, animations)
- `.ply` - Point clouds and meshes
- `.obj` - Wavefront OBJ (may need `.mtl` file)
- `.stl` - STL meshes
- `.fbx` - Autodesk FBX (requires loader)

## Requirements

- Modern browser with WebGL support
- ES2020+ JavaScript features
- Three.js r170+

## Examples

See the `examples/` directory for:
- ✅ `standalone-viewer.html` - Basic setup
- 🔄 `umd-bundle-example.html` - Using UMD bundle (requires build)
- 🔄 `esm-module-example.html` - Using ES modules (requires build)

## Next Steps

To actually use ThreePresenter in standalone mode:

1. **Run the build**: `npm run build:standalone`
2. **Copy files**:
   - `dist-standalone/three-presenter.umd.js`
   - Your 3D models
3. **Create HTML** following the examples above
4. **Serve with HTTP server** (required for ES modules)

## Notes

⚠️ **Important**: The current ThreePresenter has TypeScript dependencies and needs to be built before use in HTML.

✅ **Future Enhancement**: Consider creating a pre-built UMD bundle for easier standalone usage.

🎯 **Alternative**: Use the full OCRA application and embed it in an iframe if you need immediate standalone usage.
