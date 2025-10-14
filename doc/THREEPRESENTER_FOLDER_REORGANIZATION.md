# ThreePresenter Folder Reorganization Proposal

## Executive Summary

This document proposes a folder reorganization to make **ThreePresenter** clearly independent from the OCRA web application, preparing it for potential future extraction into a separate repository/npm package.

## Current Issues

1. **ThreePresenter is split across two locations:**
   - `frontend/src/components/ThreePresenter.ts` (main class, 1156 lines)
   - `frontend/src/components/three-presenter/` (supporting modules)

2. **Mixed with application components:**
   - Located in `components/` alongside React components
   - Not clear what's ThreePresenter vs what's OCRA UI

3. **Unclear boundaries:**
   - `OcraFileUrlResolver` is OCRA-specific but lives in three-presenter folder
   - Shared types live in `shared/scene-types.ts` at workspace root
   - React wrapper `ThreeJSViewer.tsx` is in components folder

## Proposed Structure

### Option A: Library-Style Structure (Recommended)

Create a clear "library" folder within frontend that can be easily extracted:

```
frontend/
├── src/
│   ├── lib/                              # 🆕 Independent libraries
│   │   └── three-presenter/              # ThreePresenter library (framework-agnostic)
│   │       ├── package.json              # Future: package metadata
│   │       ├── README.md                 # Usage documentation
│   │       ├── LICENSE                   # MIT/Apache license
│   │       ├── tsconfig.json             # TS config for the library
│   │       │
│   │       ├── src/                      # Library source code
│   │       │   ├── index.ts              # Main entry point & public API
│   │       │   ├── ThreePresenter.ts     # Main class (moved from components/)
│   │       │   │
│   │       │   ├── managers/             # Core subsystems
│   │       │   │   ├── AnnotationManager.ts
│   │       │   │   ├── CameraManager.ts
│   │       │   │   ├── LightingManager.ts
│   │       │   │   └── ModelLoader.ts
│   │       │   │
│   │       │   ├── ui/                   # UI components (framework-agnostic)
│   │       │   │   └── UIControlsBuilder.ts
│   │       │   │
│   │       │   ├── utils/                # Utilities
│   │       │   │   └── GeometryUtils.ts
│   │       │   │
│   │       │   └── types/                # Type definitions
│   │       │       ├── AnnotationTypes.ts
│   │       │       ├── FileUrlResolver.ts
│   │       │       └── SceneTypes.ts     # Moved from shared/
│   │       │
│   │       ├── examples/                 # Standalone examples
│   │       │   ├── basic.html            # Minimal usage example
│   │       │   ├── advanced.html         # Full-featured example
│   │       │   ├── custom-resolver.html  # Custom URL resolver
│   │       │   └── assets/
│   │       │       └── venus.glb
│   │       │
│   │       └── dist/                     # Built artifacts (gitignored)
│   │           ├── three-presenter.js
│   │           ├── three-presenter.d.ts
│   │           └── three-presenter.css
│   │
│   ├── adapters/                         # 🆕 OCRA-specific adapters
│   │   └── three-presenter/
│   │       ├── OcraFileUrlResolver.ts    # Moved from lib
│   │       ├── ThreeJSViewer.tsx         # React wrapper
│   │       └── useThreePresenter.ts      # React hook (future)
│   │
│   ├── components/                       # Pure React UI components
│   │   ├── SidebarLayout.tsx
│   │   └── ... (other UI components)
│   │
│   ├── routes/                           # Application routes
│   ├── services/                         # API services
│   ├── utils/                            # App utilities
│   └── ...
│
└── examples/                             # OCRA examples (separate from lib)
    └── venus.glb
```

### Option B: Monorepo-Style Structure (More Ambitious)

Prepare for future extraction as a separate workspace/package:

```
frontend/
├── packages/                             # 🆕 Internal packages
│   └── three-presenter/
│       ├── package.json                  # Can be published to npm
│       ├── README.md
│       ├── src/
│       │   ├── index.ts
│       │   ├── ThreePresenter.ts
│       │   └── ... (same structure as Option A)
│       ├── examples/
│       └── dist/
│
└── src/                                  # OCRA application code
    ├── adapters/
    │   └── three-presenter/
    │       ├── OcraFileUrlResolver.ts
    │       └── ThreeJSViewer.tsx
    ├── components/
    ├── routes/
    └── ...
```

## Detailed Migration Plan

### Phase 1: Create New Structure (No Breaking Changes)

1. **Create library folder**
   ```bash
   mkdir -p frontend/src/lib/three-presenter/src
   mkdir -p frontend/src/lib/three-presenter/examples
   mkdir -p frontend/src/adapters/three-presenter
   ```

2. **Move core files**
   - `ThreePresenter.ts` → `lib/three-presenter/src/`
   - `three-presenter/*` → `lib/three-presenter/src/managers/`, `ui/`, `utils/`, `types/`
   - Copy `shared/scene-types.ts` → `lib/three-presenter/src/types/SceneTypes.ts`

3. **Move OCRA-specific files**
   - `OcraFileUrlResolver.ts` → `adapters/three-presenter/`
   - `ThreeJSViewer.tsx` → `adapters/three-presenter/`

4. **Update imports** (automated with find/replace)
   ```typescript
   // Before
   import { ThreePresenter } from './ThreePresenter';
   import { OcraFileUrlResolver } from './three-presenter/OcraFileUrlResolver';
   
   // After
   import { ThreePresenter } from '../lib/three-presenter';
   import { OcraFileUrlResolver } from '../adapters/three-presenter/OcraFileUrlResolver';
   ```

### Phase 2: Add Library Metadata

1. **Create `lib/three-presenter/README.md`**
   ```markdown
   # ThreePresenter
   
   A framework-agnostic 3D viewer library built on Three.js.
   
   ## Features
   - Multi-format 3D model loading (GLB, PLY, OBJ, NXS)
   - Annotation system (points, lines, areas)
   - Camera controls (perspective/orthographic)
   - Lighting & environment
   - UI controls builder
   - Screenshot capture
   
   ## Installation
   Currently bundled with OCRA. Future: `npm install three-presenter`
   
   ## Quick Start
   ... (copy from THREEPRESENTER_REFACTORING.md)
   ```

2. **Create `lib/three-presenter/package.json`**
   ```json
   {
     "name": "three-presenter",
     "version": "0.1.0",
     "description": "Framework-agnostic 3D viewer library",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "license": "MIT",
     "peerDependencies": {
       "three": "^0.180.0"
     },
     "keywords": ["three.js", "3d-viewer", "webgl", "annotations"]
   }
   ```

3. **Create `lib/three-presenter/tsconfig.json`**
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "declaration": true,
       "declarationMap": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "examples"]
   }
   ```

### Phase 3: Create Standalone Examples

Create `lib/three-presenter/examples/basic.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ThreePresenter - Basic Example</title>
  <style>
    body { margin: 0; font-family: system-ui; }
    #viewer { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="viewer"></div>
  
  <script type="module">
    import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
    import { ThreePresenter } from '../dist/three-presenter.js';
    
    // Custom resolver for this example
    const resolver = (file) => `./assets/${file}`;
    
    const viewer = new ThreePresenter(
      document.getElementById('viewer'),
      { urlResolver: resolver }
    );
    
    viewer.loadScene({
      projectId: 'example',
      models: [{
        id: 'venus',
        filename: 'venus.glb',
        visible: true
      }]
    });
  </script>
</body>
</html>
```

### Phase 4: Update Build Configuration

Modify `frontend/vite.config.ts` to build the library separately:

```typescript
// Add library build entry
export default defineConfig({
  // ... existing config
  build: {
    lib: {
      entry: 'src/lib/three-presenter/src/index.ts',
      name: 'ThreePresenter',
      fileName: 'three-presenter'
    },
    rollupOptions: {
      external: ['three'],
      output: {
        globals: { three: 'THREE' }
      }
    }
  }
});
```

## Benefits of This Reorganization

### 1. **Clear Boundaries**
- ✅ Library code in `lib/three-presenter/`
- ✅ OCRA adapters in `adapters/three-presenter/`
- ✅ No ambiguity about what's reusable vs app-specific

### 2. **Easy Extraction**
```bash
# Future: Extract to separate repo
cp -r frontend/src/lib/three-presenter/ ../three-presenter-library/
cd ../three-presenter-library
npm init
npm publish
```

### 3. **Better Documentation**
- Library README at `lib/three-presenter/README.md`
- Standalone examples that don't depend on OCRA
- Clear API documentation

### 4. **Independent Testing**
```typescript
// Test library in isolation
import { ThreePresenter } from '@/lib/three-presenter';

// Test OCRA integration
import { OcraFileUrlResolver } from '@/adapters/three-presenter/OcraFileUrlResolver';
```

### 5. **Version Control**
- Library has its own package.json with semver
- Can track breaking changes independently
- Easier to maintain compatibility

## Implementation Checklist

- [ ] Create `frontend/src/lib/three-presenter/` directory structure
- [ ] Create `frontend/src/adapters/three-presenter/` directory
- [ ] Move `ThreePresenter.ts` to library
- [ ] Move all `three-presenter/*` modules to library subfolders
- [ ] Copy `shared/scene-types.ts` to library types
- [ ] Move `OcraFileUrlResolver.ts` to adapters
- [ ] Move `ThreeJSViewer.tsx` to adapters
- [ ] Update all imports in OCRA application files
- [ ] Create library `README.md`
- [ ] Create library `package.json`
- [ ] Create library `tsconfig.json`
- [ ] Create standalone examples in `lib/three-presenter/examples/`
- [ ] Update build configuration for library output
- [ ] Update documentation to reflect new structure
- [ ] Test application still works
- [ ] Update `.gitignore` for library dist folder

## Migration Timeline

- **Week 1**: Phase 1 - Move files and update imports
- **Week 2**: Phase 2 - Add library metadata and documentation
- **Week 3**: Phase 3 - Create standalone examples
- **Week 4**: Phase 4 - Update build configuration and testing

## Backward Compatibility

During migration, maintain backward compatibility:

```typescript
// lib/three-presenter/src/index.ts
// Re-export everything for easy migration
export * from './ThreePresenter';
export * from './managers/AnnotationManager';
export * from './managers/CameraManager';
// ... etc
```

Old imports continue working:
```typescript
// Still works during migration
import { ThreePresenter } from '../lib/three-presenter';
```

## Future: Separate Repository

Once stable, the library can be extracted:

```
three-presenter/                    # New standalone repo
├── package.json                    # Publishable to npm
├── README.md
├── LICENSE
├── src/                            # Library source
├── examples/                       # Standalone examples
├── docs/                           # API documentation
└── dist/                           # Built artifacts

ocra/                               # OCRA application
└── frontend/
    ├── package.json                # Add: "three-presenter": "^0.1.0"
    └── src/
        └── adapters/
            └── three-presenter/    # OCRA-specific code
                ├── OcraFileUrlResolver.ts
                └── ThreeJSViewer.tsx
```

## Conclusion

This reorganization:
- ✅ Makes ThreePresenter clearly independent
- ✅ Prepares for future extraction
- ✅ Improves code organization
- ✅ Maintains backward compatibility
- ✅ Enables standalone documentation and examples
- ✅ Sets foundation for npm package publication

**Recommended Approach**: Start with **Option A** (Library-Style Structure), as it's less disruptive and provides most benefits without requiring workspace/monorepo setup.
