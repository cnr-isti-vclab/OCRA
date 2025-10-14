# ThreePresenter Architecture - Current vs Proposed

## Current Architecture (Monolithic)

```
┌─────────────────────────────────────────────────────────┐
│                  ThreePresenter.ts                      │
│                    (1,528 lines)                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Rendering (Three.js scene, camera, renderer)    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Model Loading (PLY, GLTF, OBJ loaders)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Camera Management (perspective/ortho switching) │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Annotations (rendering, selection, picking)     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ UI Controls (buttons, toolbar, events)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Lighting (headlight, environment maps)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Interactions (raycasting, double-click, etc)    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Transformations (position, rotation, scale)     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Utils (bbox, stats, ground grid)                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ State Management (visibility, camera state)     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         ├─ Depends on: getApiBase() (OCRA coupling)
         └─ 75+ public properties/methods
```

### Problems:
- ❌ Everything in one file (hard to navigate)
- ❌ Mixed concerns (rendering + UI + business logic)
- ❌ Hard to test (tightly coupled)
- ❌ OCRA-specific dependencies
- ❌ Difficult to reuse
- ❌ No clear API boundaries

---

## Proposed Architecture (Modular)

```
┌──────────────────────────────────────────────────────────────────┐
│                        ThreePresenter                            │
│                      (Core Orchestrator)                         │
│                        (~250 lines)                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐         │
│  │   models   │  │    camera    │  │  annotations   │  Public │
│  │    API     │  │     API      │  │      API       │   APIs  │
│  └─────┬──────┘  └──────┬───────┘  └────────┬───────┘         │
│        │                │                    │                  │
└────────┼────────────────┼────────────────────┼──────────────────┘
         │                │                    │
         ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Managers                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  SceneManager    │  │  CameraManager   │  │ Annotation   │ │
│  │                  │  │                  │  │   Manager    │ │
│  │ • addModel()     │  │ • switchType()   │  │ • render()   │ │
│  │ • setVisibility()│  │ • reset()        │  │ • select()   │ │
│  │ • getStats()     │  │ • frame()        │  │ • pick()     │ │
│  │ • dispose()      │  │ • getState()     │  │ • update()   │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  ModelLoader     │  │  RenderLoop      │  │ Interaction  │ │
│  │                  │  │                  │  │   Manager    │ │
│  │ • loadPLY()      │  │ • start()        │  │ • raycast()  │ │
│  │ • loadGLTF()     │  │ • stop()         │  │ • onClick()  │ │
│  │ • loadOBJ()      │  │ • update()       │  │ • onDrag()   │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Utilities (Pure)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ BoundingBox  │  │ GeometryStats│  │ FileUrlResolver    │   │
│  │              │  │              │  │ (Injectable!)      │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Optional Features                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ ToolbarBuilder│  │ ScreenshotTool│  │ GroundPlane │         │
│  │  (Optional)  │  │   (Optional)  │  │  (Optional) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Benefits:
- ✅ Clear separation of concerns
- ✅ Each module < 300 lines
- ✅ Easy to test (mockable managers)
- ✅ No OCRA coupling (injectable resolver)
- ✅ Reusable in any project
- ✅ Clean public API

---

## API Comparison

### Current API (Implicit, Mixed)

```typescript
const presenter = new ThreePresenter(mount);

// Scattered methods
presenter.loadScene(scene);
presenter.setModelVisibility('id', false);
presenter.renderAnnotations(annotations);
presenter.selectAnnotation('id', false);
presenter.resetCamera();
presenter.toggleCameraMode();
presenter.takeScreenshot();

// 75+ public properties you need to know
presenter.scene, presenter.camera, presenter.controls,
presenter.models, presenter.annotationMarkers,
presenter.selectedAnnotations, presenter.isPickingMode, ...
```

### Proposed API (Explicit, Organized)

```typescript
const viewer = new ThreePresenter(mount, config);

// Organized by domain
// MODELS
viewer.models.add('id', object);
viewer.models.setVisibility('id', false);
viewer.models.applyTransform('id', transform);
viewer.models.getStats('id');

// CAMERA
viewer.camera.reset();
viewer.camera.setType('orthographic');
viewer.camera.frame(bbox);
viewer.camera.getState();

// ANNOTATIONS
viewer.annotations.render(list);
viewer.annotations.select(['id1', 'id2']);
viewer.annotations.getSelected();
viewer.annotations.enablePicking(callback);

// EVENTS
viewer.on('modelLoaded', callback);
viewer.on('selectionChanged', callback);

// LIFECYCLE
viewer.dispose();
```

---

## File Size Comparison

### Current

```
ThreePresenter.ts          1,528 lines  ⚠️ Too large!
```

### Proposed

```
core/
  ThreePresenter.ts          ~250 lines  ✅
  SceneManager.ts            ~200 lines  ✅
  CameraManager.ts           ~180 lines  ✅
  RenderLoop.ts              ~100 lines  ✅
  InteractionManager.ts      ~150 lines  ✅

features/
  AnnotationManager.ts       ~250 lines  ✅
  ModelLoader.ts             ~200 lines  ✅
  TransformControls.ts       ~120 lines  ✅
  GroundPlane.ts             ~80 lines   ✅

ui/
  ToolbarBuilder.ts          ~150 lines  ✅
  ViewportGizmo.ts           ~80 lines   ✅
  ScreenshotTool.ts          ~60 lines   ✅

utils/
  BoundingBox.ts             ~80 lines   ✅
  FileUrlResolver.ts         ~40 lines   ✅
  GeometryStats.ts           ~100 lines  ✅

types/
  SceneTypes.ts              ~100 lines  ✅
  AnnotationTypes.ts         ~50 lines   ✅
  ConfigTypes.ts             ~80 lines   ✅
  EventTypes.ts              ~40 lines   ✅

Total: ~2,300 lines (more code, but organized!)
```

**Key Insight:** We're not reducing code, we're **organizing** it for maintainability!

---

## Dependency Graph

### Current (Tight Coupling)

```
ThreePresenter
    ↓
    ├─ Three.js ✅
    ├─ getApiBase() ❌ (OCRA-specific)
    ├─ scene-types.ts ✅
    └─ oauth.ts ❌ (OCRA-specific)
```

### Proposed (Loose Coupling)

```
ThreePresenter
    ↓
    ├─ Three.js ✅
    ├─ Managers (internal)
    │   └─ Three.js ✅
    ├─ Types (shared) ✅
    └─ Config (injectable) ✅
        └─ urlResolver: (file) => string  (provided by OCRA)
```

---

## Usage Examples

### In OCRA (with injection)

```typescript
import { ThreePresenter } from './three-presenter';
import { getApiBase } from '../config/oauth';

const viewer = new ThreePresenter(container, {
  urlResolver: (file, projectId) => 
    `${getApiBase()}/api/projects/${projectId}/files/${file}`,
  toolbar: {
    buttons: ['home', 'light', 'camera', 'screenshot']
  }
});

await viewer.loadScene(scene);
viewer.annotations.render(annotations);

// React integration
viewer.on('selectionChanged', (ids) => {
  setSelectedIds(ids);  // Update React state
});
```

### Standalone (static files)

```typescript
import { ThreePresenter } from 'three-presenter';

const viewer = new ThreePresenter(container, {
  urlResolver: (file) => `/models/${file}`,
  toolbar: true
});

await viewer.loadScene({
  models: [
    { id: 'm1', file: 'model.glb', visible: true }
  ]
});
```

### Minimal (no toolbar, custom URL)

```typescript
const viewer = new ThreePresenter(container, {
  urlResolver: (file) => `https://cdn.example.com/${file}`,
  toolbar: false,
  camera: { type: 'orthographic', fov: 30 }
});

// Manual controls
document.getElementById('reset').onclick = () => viewer.camera.reset();
document.getElementById('ortho').onclick = () => viewer.camera.setType('orthographic');
```

---

## Testing Strategy

### Current (Hard to Test)

```typescript
// Can't easily test without full DOM setup
const presenter = new ThreePresenter(document.createElement('div'));
// Tightly coupled - hard to mock
```

### Proposed (Easy to Test)

```typescript
// Unit test managers in isolation
describe('AnnotationManager', () => {
  it('should select annotations', () => {
    const scene = new THREE.Scene();
    const manager = new AnnotationManager(scene);
    
    manager.render([{ id: 'a1', ... }]);
    manager.select(['a1'], false);
    
    expect(manager.getSelected()).toEqual(['a1']);
  });
});

// Integration test with mocks
const mockUrlResolver = jest.fn((file) => `/mock/${file}`);
const viewer = new ThreePresenter(container, {
  urlResolver: mockUrlResolver
});
```

---

## Migration Path (Gradual)

### Step 1: Keep Compatibility Wrapper
```typescript
// Current import still works
import { ThreePresenter } from './components/ThreePresenter';
// ↓ internally delegates to new modular version
```

### Step 2: Migrate React Component
```typescript
// Old way (still supported)
const presenter = new ThreePresenter(mount);

// New way (recommended)
const presenter = new ThreePresenter(mount, {
  urlResolver: (file, projectId) => getUrl(file, projectId)
});
```

### Step 3: Gradual Feature Migration
```typescript
// Old: presenter.setModelVisibility('id', false)
// New: presenter.models.setVisibility('id', false)
// Both work during transition!
```

### Step 4: Remove Legacy
After all code migrated, remove compatibility shim.

---

## Decision Time

### Option A: Full Refactor (Recommended)
- **Time:** 2-3 months
- **Benefit:** Clean, maintainable, reusable
- **Risk:** Medium (needs testing)

### Option B: Quick Wins Only
- **Time:** 2 weeks
- **Benefit:** Some improvements
- **Risk:** Low (minimal changes)

### Option C: Hybrid Approach
- **Time:** 1 month
- **Benefit:** Core modules + some cleanup
- **Risk:** Low-Medium

---

## Recommendation

Start with **Option C (Hybrid)**:

1. **Week 1:** Extract types + AnnotationManager
2. **Week 2:** Inject URL resolver + extract ModelLoader
3. **Week 3:** Create public API structure
4. **Week 4:** Documentation + testing

This gives you:
- ✅ Independent AnnotationManager (most complex feature)
- ✅ No OCRA coupling
- ✅ Cleaner API
- ✅ Foundation for future refactoring

Then decide: continue full refactor or stop here?
