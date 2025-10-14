# ThreePresenter Reorganization - Visual Guide

## Current Structure (Before)

```
frontend/
└── src/
    ├── components/
    │   ├── ThreePresenter.ts ⚠️ (1156 lines - main class)
    │   ├── ThreeJSViewer.tsx 🔵 (React wrapper)
    │   ├── SidebarLayout.tsx 🔵
    │   │
    │   └── three-presenter/ ⚠️
    │       ├── AnnotationManager.ts ⚠️
    │       ├── CameraManager.ts ⚠️
    │       ├── LightingManager.ts ⚠️
    │       ├── ModelLoader.ts ⚠️
    │       ├── UIControlsBuilder.ts ⚠️
    │       ├── OcraFileUrlResolver.ts 🟠 (OCRA-specific!)
    │       ├── index.ts ⚠️
    │       ├── types/
    │       │   ├── AnnotationTypes.ts ⚠️
    │       │   └── FileUrlResolver.ts ⚠️
    │       └── utils/
    │           └── GeometryUtils.ts ⚠️
    │
    ├── routes/
    │   └── ProjectPage.tsx 🔵
    │
    └── ...

shared/ (workspace root)
└── scene-types.ts ⚠️ (used by ThreePresenter)

Legend:
⚠️  = ThreePresenter library code (framework-agnostic)
🟠 = OCRA adapter code (app-specific)
🔵 = OCRA application code (React UI)
```

**Problems:**
- ❌ ThreePresenter library mixed with React components
- ❌ OCRA-specific adapter in library folder
- ❌ Shared types at workspace root
- ❌ No clear boundary between library and app
- ❌ Hard to extract as standalone package

---

## Proposed Structure (After - Option A: Library Style)

```
frontend/
├── src/
│   ├── lib/ 📦 NEW - Independent libraries
│   │   └── three-presenter/ ⚠️
│   │       ├── README.md
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       │
│   │       ├── src/
│   │       │   ├── index.ts ⚠️ (public API)
│   │       │   ├── ThreePresenter.ts ⚠️ (moved from components/)
│   │       │   │
│   │       │   ├── managers/ ⚠️
│   │       │   │   ├── AnnotationManager.ts
│   │       │   │   ├── CameraManager.ts
│   │       │   │   ├── LightingManager.ts
│   │       │   │   └── ModelLoader.ts
│   │       │   │
│   │       │   ├── ui/ ⚠️
│   │       │   │   └── UIControlsBuilder.ts
│   │       │   │
│   │       │   ├── utils/ ⚠️
│   │       │   │   └── GeometryUtils.ts
│   │       │   │
│   │       │   └── types/ ⚠️
│   │       │       ├── AnnotationTypes.ts
│   │       │       ├── FileUrlResolver.ts
│   │       │       └── SceneTypes.ts (moved from shared/)
│   │       │
│   │       └── examples/ 📖
│   │           ├── basic.html (standalone demo)
│   │           ├── advanced.html
│   │           └── assets/
│   │               └── venus.glb
│   │
│   ├── adapters/ 🔌 NEW - App-specific adapters
│   │   └── three-presenter/ 🟠
│   │       ├── OcraFileUrlResolver.ts (moved from lib)
│   │       ├── ThreeJSViewer.tsx (moved from components/)
│   │       └── useThreePresenter.ts (future React hook)
│   │
│   ├── components/ 🔵 Pure React UI
│   │   ├── SidebarLayout.tsx
│   │   └── ... (other UI components)
│   │
│   ├── routes/ 🔵
│   │   └── ProjectPage.tsx
│   │
│   └── ...
│
└── examples/ (OCRA-level examples)

Legend:
⚠️  = ThreePresenter library (can be extracted)
🟠 = OCRA adapters (bridge between library and app)
🔵 = OCRA application (React UI)
📦 = Independent package boundary
🔌 = Adapter layer
📖 = Documentation/examples
```

**Benefits:**
- ✅ Clear separation: lib vs adapters vs app
- ✅ Library can be copied to new repo
- ✅ OCRA-specific code isolated in adapters
- ✅ Standalone examples work without OCRA
- ✅ Self-documenting folder structure

---

## Import Paths Comparison

### Before (Current)
```typescript
// In ProjectPage.tsx
import { ThreePresenter } from '../components/ThreePresenter';
import { OcraFileUrlResolver } from '../components/three-presenter/OcraFileUrlResolver';
import ThreeJSViewer from '../components/ThreeJSViewer';

// Problem: Everything looks like a React component
```

### After (Proposed)
```typescript
// In ProjectPage.tsx
import { ThreePresenter } from '../lib/three-presenter';
import { OcraFileUrlResolver } from '../adapters/three-presenter/OcraFileUrlResolver';
import ThreeJSViewer from '../adapters/three-presenter/ThreeJSViewer';

// Clear: library, adapter, wrapper
```

---

## Dependency Flow

### Current (Tangled)
```
┌─────────────────────────────────────────┐
│         OCRA Application                │
│  ┌────────────────────────────────┐    │
│  │  ProjectPage.tsx               │    │
│  │  └──> ThreeJSViewer.tsx        │    │
│  │       └──> ThreePresenter.ts   │    │
│  │            └──> OcraFileUrlResolver │ ← Mixed!
│  │            └──> AnnotationManager   │
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘

❌ Everything mixed together
❌ Can't extract ThreePresenter easily
```

### Proposed (Clean Layers)
```
┌─────────────────────────────────────────────────────────┐
│                    OCRA Application                     │
│                                                          │
│  ┌────────────────────────────────────────────┐        │
│  │         Routes (ProjectPage.tsx)            │        │
│  └──────────────────┬──────────────────────────┘        │
│                     │                                    │
│                     ↓                                    │
│  ┌────────────────────────────────────────────┐        │
│  │      Adapters (OCRA-specific bridge)       │ 🟠     │
│  │  • ThreeJSViewer.tsx (React wrapper)       │        │
│  │  • OcraFileUrlResolver.ts (API resolver)   │        │
│  └──────────────────┬──────────────────────────┘        │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│         ThreePresenter Library (independent)            │ ⚠️
│  • ThreePresenter.ts                                    │
│  • AnnotationManager, CameraManager, etc.              │
│  • Framework-agnostic                                   │
│  • Uses FileUrlResolver interface (injected)           │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│                    Three.js                             │
└─────────────────────────────────────────────────────────┘

✅ Clear layer boundaries
✅ Library is independent
✅ OCRA adapters bridge the gap
✅ Easy to extract and reuse
```

---

## File Movement Summary

### Files to Move to `lib/three-presenter/src/`

| Current Path | New Path | Lines |
|-------------|----------|-------|
| `components/ThreePresenter.ts` | `lib/three-presenter/src/ThreePresenter.ts` | 1156 |
| `components/three-presenter/AnnotationManager.ts` | `lib/three-presenter/src/managers/AnnotationManager.ts` | ~300 |
| `components/three-presenter/CameraManager.ts` | `lib/three-presenter/src/managers/CameraManager.ts` | ~200 |
| `components/three-presenter/LightingManager.ts` | `lib/three-presenter/src/managers/LightingManager.ts` | ~150 |
| `components/three-presenter/ModelLoader.ts` | `lib/three-presenter/src/managers/ModelLoader.ts` | ~400 |
| `components/three-presenter/UIControlsBuilder.ts` | `lib/three-presenter/src/ui/UIControlsBuilder.ts` | ~250 |
| `components/three-presenter/utils/GeometryUtils.ts` | `lib/three-presenter/src/utils/GeometryUtils.ts` | ~200 |
| `components/three-presenter/types/AnnotationTypes.ts` | `lib/three-presenter/src/types/AnnotationTypes.ts` | ~50 |
| `components/three-presenter/types/FileUrlResolver.ts` | `lib/three-presenter/src/types/FileUrlResolver.ts` | ~100 |
| `components/three-presenter/index.ts` | `lib/three-presenter/src/index.ts` | ~80 |
| `../../shared/scene-types.ts` (copy) | `lib/three-presenter/src/types/SceneTypes.ts` | ~130 |

**Total Library Code: ~3,016 lines**

### Files to Move to `adapters/three-presenter/`

| Current Path | New Path | Lines |
|-------------|----------|-------|
| `components/three-presenter/OcraFileUrlResolver.ts` | `adapters/three-presenter/OcraFileUrlResolver.ts` | 85 |
| `components/ThreeJSViewer.tsx` | `adapters/three-presenter/ThreeJSViewer.tsx` | 134 |

**Total Adapter Code: ~219 lines**

---

## Future: Extraction to Separate Repository

Once the reorganization is complete, extracting to a separate repo is simple:

```bash
# 1. Copy library folder
cp -r frontend/src/lib/three-presenter/ ../three-presenter-library/

# 2. Initialize as package
cd ../three-presenter-library/
npm init
git init

# 3. Publish to npm
npm publish

# 4. Use in OCRA via npm
cd ocra/frontend/
npm install three-presenter@^0.1.0

# 5. Update imports in OCRA
# Before:
import { ThreePresenter } from '../lib/three-presenter';

# After:
import { ThreePresenter } from 'three-presenter';
```

The adapter layer remains in OCRA:
```
ocra/frontend/src/adapters/three-presenter/
├── OcraFileUrlResolver.ts  ← Uses OCRA's API
└── ThreeJSViewer.tsx       ← Wraps library for React
```

---

## Migration Script (Automated)

```bash
#!/bin/bash
# migrate-three-presenter.sh

echo "🚀 Migrating ThreePresenter to library structure..."

# Create new directories
mkdir -p frontend/src/lib/three-presenter/src/{managers,ui,utils,types}
mkdir -p frontend/src/lib/three-presenter/examples/assets
mkdir -p frontend/src/adapters/three-presenter

# Move library files
echo "📦 Moving library files..."
mv frontend/src/components/ThreePresenter.ts \
   frontend/src/lib/three-presenter/src/

mv frontend/src/components/three-presenter/AnnotationManager.ts \
   frontend/src/lib/three-presenter/src/managers/

mv frontend/src/components/three-presenter/CameraManager.ts \
   frontend/src/lib/three-presenter/src/managers/

mv frontend/src/components/three-presenter/LightingManager.ts \
   frontend/src/lib/three-presenter/src/managers/

mv frontend/src/components/three-presenter/ModelLoader.ts \
   frontend/src/lib/three-presenter/src/managers/

mv frontend/src/components/three-presenter/UIControlsBuilder.ts \
   frontend/src/lib/three-presenter/src/ui/

mv frontend/src/components/three-presenter/utils/GeometryUtils.ts \
   frontend/src/lib/three-presenter/src/utils/

mv frontend/src/components/three-presenter/types/*.ts \
   frontend/src/lib/three-presenter/src/types/

mv frontend/src/components/three-presenter/index.ts \
   frontend/src/lib/three-presenter/src/

# Copy shared types
cp shared/scene-types.ts \
   frontend/src/lib/three-presenter/src/types/SceneTypes.ts

# Move adapter files
echo "🔌 Moving adapter files..."
mv frontend/src/components/three-presenter/OcraFileUrlResolver.ts \
   frontend/src/adapters/three-presenter/

mv frontend/src/components/ThreeJSViewer.tsx \
   frontend/src/adapters/three-presenter/

# Move examples
mv frontend/examples/venus.glb \
   frontend/src/lib/three-presenter/examples/assets/

# Clean up old directories
rmdir frontend/src/components/three-presenter/{types,utils}
rmdir frontend/src/components/three-presenter

echo "✅ Migration complete!"
echo "⚠️  Now run: npm run update-imports"
```

---

## Testing the New Structure

### 1. Library Works Independently
```typescript
// Test in Node.js environment (no React)
import { ThreePresenter } from './lib/three-presenter';

const container = document.createElement('div');
const viewer = new ThreePresenter(container);
await viewer.loadScene({ ... });
// ✅ Works without React or OCRA
```

### 2. OCRA Integration Still Works
```typescript
// In ProjectPage.tsx
import ThreeJSViewer from '../adapters/three-presenter/ThreeJSViewer';

function ProjectPage() {
  return <ThreeJSViewer sceneDesc={scene} />;
}
// ✅ React wrapper works
```

### 3. Standalone Examples Work
```bash
cd frontend/src/lib/three-presenter/examples
python3 -m http.server 8000
# Open http://localhost:8000/basic.html
# ✅ Example works without OCRA backend
```

---

## Summary

This reorganization transforms ThreePresenter from:

**A component embedded in OCRA**
```
components/
├── ThreePresenter.ts
├── ThreeJSViewer.tsx
└── three-presenter/
```

**Into a proper library**
```
lib/three-presenter/      ← Can be extracted
adapters/three-presenter/ ← OCRA-specific bridge
```

**Key Benefits:**
1. ✅ **Independence**: Library has no OCRA dependencies
2. ✅ **Clarity**: Obvious what's library vs adapter vs app
3. ✅ **Reusability**: Can be used in other projects
4. ✅ **Testability**: Can test library in isolation
5. ✅ **Documentation**: Self-contained docs and examples
6. ✅ **Extractability**: Ready to become standalone package
7. ✅ **Maintainability**: Clear boundaries reduce coupling

**Next Steps:**
1. Review this proposal with the team
2. Run the migration script
3. Update imports across the codebase
4. Create standalone examples
5. Test thoroughly
6. Update documentation
