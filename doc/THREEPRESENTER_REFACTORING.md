# ThreePresenter Refactoring Plan

## Current State Analysis

**File:** `frontend/src/components/ThreePresenter.ts`  
**Size:** 1,528 lines  
**Current Issues:**
- Single monolithic class handling multiple concerns
- Tight coupling with OCRA-specific APIs (`getApiBase()`)
- UI control creation mixed with 3D rendering logic
- Hard to test individual features
- Difficult to navigate and maintain
- Not easily reusable in other projects

## Refactoring Goals

Following the **3DHOP philosophy**, create a clean, embeddable 3D viewer with:

1. **Clear separation of concerns** - modular architecture
2. **Framework independence** - no React/OCRA coupling
3. **Simple, documented API** - easy to integrate
4. **Extensible design** - plugins for custom features
5. **Zero configuration** - sensible defaults
6. **Minimal dependencies** - only Three.js core

---

## Proposed Architecture

### 1. Core Module Structure

```
frontend/src/components/three-presenter/
├── index.ts                          # Public API exports
├── core/
│   ├── ThreePresenter.ts            # Main orchestrator (< 300 lines)
│   ├── SceneManager.ts              # Scene setup, models, lighting
│   ├── CameraManager.ts             # Camera controls, transitions
│   ├── RenderLoop.ts                # Animation loop, frame updates
│   └── InteractionManager.ts        # Mouse/touch events, raycasting
├── features/
│   ├── AnnotationManager.ts         # Annotation rendering & selection
│   ├── ModelLoader.ts               # Multi-format model loading
│   ├── TransformControls.ts         # Model transformation
│   └── GroundPlane.ts               # Grid helper management
├── ui/
│   ├── ToolbarBuilder.ts            # UI controls factory
│   ├── ViewportGizmo.ts             # Camera orientation widget
│   └── ScreenshotTool.ts            # Screenshot functionality
├── utils/
│   ├── BoundingBox.ts               # Bbox calculations
│   ├── FileUrlResolver.ts           # URL resolution (injectable)
│   └── GeometryStats.ts             # Triangle/vertex counting
└── types/
    ├── SceneTypes.ts                # Scene description interfaces
    ├── AnnotationTypes.ts           # Annotation interfaces
    ├── ConfigTypes.ts               # Configuration options
    └── EventTypes.ts                # Event callbacks
```

### 2. Clean Public API

```typescript
// Simple initialization
const viewer = new ThreePresenter(containerElement, {
  urlResolver: (file) => `/api/files/${file}`,  // Injectable
  toolbar: true,
  camera: { fov: 40, type: 'perspective' },
  lighting: { headlight: true, environment: true },
  background: '#404040'
});

// Scene loading
await viewer.loadScene(sceneDescription);

// Model operations
viewer.models.setVisibility('model_id', false);
viewer.models.applyTransform('model_id', { position: [0, 1, 0] });
const stats = viewer.models.getStats('model_id');

// Camera operations
viewer.camera.reset();
viewer.camera.setType('orthographic');
viewer.camera.frame(bbox);

// Annotation operations
viewer.annotations.render(annotationsList);
viewer.annotations.select(['id1', 'id2']);
viewer.annotations.onSelectionChange((ids) => console.log(ids));
viewer.annotations.enablePicking((point) => console.log(point));

// Event subscriptions
viewer.on('modelLoaded', (model) => console.log('Loaded:', model.id));
viewer.on('cameraChanged', (camera) => saveCameraState(camera));
viewer.on('error', (err) => handleError(err));

// Cleanup
viewer.dispose();
```

### 3. Dependency Injection Pattern

**Current Problem:** Hard-coded `getApiBase()` coupling

**Solution:** Injectable URL resolver

```typescript
// In OCRA project
import { ThreePresenter } from './three-presenter';
import { getApiBase } from '../config/oauth';

const viewer = new ThreePresenter(container, {
  urlResolver: (file, projectId) => {
    return `${getApiBase()}/api/projects/${projectId}/files/${file}`;
  }
});

// In standalone usage
const viewer = new ThreePresenter(container, {
  urlResolver: (file) => `/models/${file}`  // Simple static files
});
```

---

## Refactoring Steps (Incremental)

### Phase 1: Extract Type Definitions (Week 1)
**Goal:** Create independent type system

**Tasks:**
1. Create `types/` directory structure
2. Move `SceneDescription`, `ModelDefinition`, `Annotation` to `SceneTypes.ts`
3. Create `ConfigTypes.ts` with viewer options
4. Create `EventTypes.ts` for callbacks
5. Update imports across codebase

**Benefits:**
- Types become reusable
- Clearer documentation
- Easier testing

### Phase 2: Extract Utilities (Week 1-2)
**Goal:** Create pure utility functions

**Tasks:**
1. Extract `calculateBoundingBox()` → `BoundingBox.ts`
2. Extract `collectGeometryStats()` → `GeometryStats.ts`
3. Create `FileUrlResolver.ts` interface
4. Move math helpers to `MathUtils.ts`

**Benefits:**
- Functions become testable
- Reusable across modules
- No side effects

### Phase 3: Create Manager Classes (Week 2-3)
**Goal:** Separate concerns into focused managers

**Tasks:**

#### 3a. SceneManager
```typescript
class SceneManager {
  private scene: THREE.Scene;
  private models: Map<string, THREE.Object3D>;
  
  constructor(scene: THREE.Scene);
  addModel(id: string, object: THREE.Object3D): void;
  removeModel(id: string): void;
  setModelVisibility(id: string, visible: boolean): void;
  getModel(id: string): THREE.Object3D | undefined;
  getAllModels(): Record<string, THREE.Object3D>;
  dispose(): void;
}
```

#### 3b. CameraManager
```typescript
class CameraManager {
  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthographicCamera: THREE.OrthographicCamera;
  private currentCamera: THREE.Camera;
  
  constructor(aspect: number, options: CameraOptions);
  switchType(type: 'perspective' | 'orthographic'): void;
  reset(): void;
  frame(bbox: THREE.Box3): void;
  getState(): CameraState;
  setState(state: CameraState): void;
}
```

#### 3c. AnnotationManager
```typescript
class AnnotationManager {
  private markers: Map<string, THREE.Mesh>;
  private selectedIds: Set<string>;
  
  constructor(scene: THREE.Scene);
  render(annotations: Annotation[]): void;
  select(ids: string[], additive: boolean): void;
  getSelected(): string[];
  enablePicking(callback: (point: [number, number, number]) => void): void;
  disablePicking(): void;
  updateScale(camera: THREE.Camera): void;  // For screen-space sizing
  dispose(): void;
}
```

#### 3d. ModelLoader
```typescript
class ModelLoader {
  private urlResolver: UrlResolverFn;
  
  constructor(urlResolver: UrlResolverFn);
  async load(definition: ModelDefinition): Promise<THREE.Object3D>;
  private async loadPLY(url: string): Promise<THREE.Object3D>;
  private async loadGLTF(url: string): Promise<THREE.Object3D>;
  private async loadOBJ(url: string): Promise<THREE.Object3D>;
}
```

### Phase 4: Refactor Core Presenter (Week 3-4)
**Goal:** Thin orchestrator using managers

```typescript
class ThreePresenter {
  // Public API surfaces
  public models: SceneManager;
  public camera: CameraManager;
  public annotations: AnnotationManager;
  
  private renderer: THREE.WebGLRenderer;
  private renderLoop: RenderLoop;
  private interaction: InteractionManager;
  private toolbar?: ToolbarBuilder;
  
  constructor(container: HTMLElement, config: ViewerConfig) {
    // Initialize core Three.js components
    this.renderer = this.createRenderer(container);
    
    // Initialize managers
    this.models = new SceneManager(scene);
    this.camera = new CameraManager(aspect, config.camera);
    this.annotations = new AnnotationManager(scene);
    
    // Initialize supporting systems
    this.renderLoop = new RenderLoop(renderer, scene, camera);
    this.interaction = new InteractionManager(renderer.domElement);
    
    // Optional UI
    if (config.toolbar) {
      this.toolbar = new ToolbarBuilder(container, this);
    }
    
    // Start rendering
    this.renderLoop.start();
  }
  
  async loadScene(scene: SceneDescription): Promise<void> {
    const loader = new ModelLoader(this.config.urlResolver);
    
    for (const modelDef of scene.models) {
      const object = await loader.load(modelDef);
      this.models.addModel(modelDef.id, object);
      this.emit('modelLoaded', { id: modelDef.id });
    }
    
    if (scene.annotations) {
      this.annotations.render(scene.annotations);
    }
    
    this.camera.frame(this.models.getBoundingBox());
  }
  
  dispose(): void {
    this.renderLoop.stop();
    this.models.dispose();
    this.annotations.dispose();
    this.toolbar?.dispose();
    this.renderer.dispose();
  }
}
```

### Phase 5: Extract UI Components (Week 4)
**Goal:** Separate UI from core logic

**Tasks:**
1. Create `ToolbarBuilder` with chainable API
2. Move button creation logic out of core
3. Make UI optional and customizable

```typescript
// Optional toolbar
const toolbar = new ToolbarBuilder()
  .addButton('home', '🏠', () => viewer.camera.reset())
  .addButton('light', '💡', () => viewer.lighting.toggle())
  .addButton('camera', '📷', () => viewer.camera.toggleType())
  .addSeparator()
  .addButton('screenshot', '📸', () => viewer.screenshot())
  .build();

container.appendChild(toolbar.element);
```

### Phase 6: Event System (Week 5)
**Goal:** Decouple internal logic with events

```typescript
class ThreePresenter extends EventEmitter {
  // Built-in events
  on(event: 'modelLoaded', callback: (model: ModelEvent) => void): void;
  on(event: 'cameraChanged', callback: (camera: CameraState) => void): void;
  on(event: 'selectionChanged', callback: (ids: string[]) => void): void;
  on(event: 'annotationPicked', callback: (point: [number, number, number]) => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
}
```

---

## Benefits of Refactoring

### 1. **Maintainability**
- Each file < 300 lines
- Single responsibility per class
- Easy to locate and fix bugs

### 2. **Testability**
- Pure functions easy to unit test
- Managers can be mocked
- No DOM dependencies in core logic

### 3. **Reusability**
- Drop into any project
- No OCRA dependencies
- Framework agnostic

### 4. **Extensibility**
- Plugin architecture possible
- Custom loaders/renderers
- Override behaviors easily

### 5. **Documentation**
- Each module self-documenting
- Clear API surface
- Usage examples per feature

### 6. **Performance**
- Easier to optimize specific parts
- Lazy loading of features
- Tree-shakeable exports

---

## Migration Strategy

### Backward Compatibility

During refactoring, maintain a **compatibility shim**:

```typescript
// ThreePresenter.ts (legacy wrapper)
import { ThreePresenter as NewPresenter } from './three-presenter';
import { getApiBase } from '../config/oauth';

export class ThreePresenter extends NewPresenter {
  constructor(mount: HTMLDivElement) {
    super(mount, {
      urlResolver: (file, projectId) => 
        `${getApiBase()}/api/projects/${projectId}/files/${file}`,
      toolbar: true
    });
    
    // Legacy method aliases
    this.setModelVisibility = this.models.setVisibility.bind(this.models);
    this.renderAnnotations = this.annotations.render.bind(this.annotations);
    // ... other legacy methods
  }
}
```

### Testing Strategy

1. **Unit tests** for utilities and managers
2. **Integration tests** for core ThreePresenter
3. **Visual regression tests** for rendering
4. **Performance benchmarks** for loading/rendering

---

## Success Criteria

- [ ] ThreePresenter.ts < 300 lines
- [ ] Each module < 300 lines
- [ ] Zero OCRA-specific dependencies
- [ ] 80%+ code coverage
- [ ] Full API documentation
- [ ] Standalone npm package possible
- [ ] All existing features working
- [ ] Performance unchanged or better

---

## Timeline Estimate

- **Phase 1-2:** 1-2 weeks (types & utils)
- **Phase 3:** 2-3 weeks (managers)
- **Phase 4:** 1-2 weeks (core refactor)
- **Phase 5:** 1 week (UI extraction)
- **Phase 6:** 1 week (events)
- **Testing & Documentation:** 1-2 weeks

**Total:** 8-11 weeks (2-3 months)

---

## Alternative: Quick Wins (1-2 weeks)

If full refactoring is too ambitious, start with:

1. **Extract types** to separate files (2 days)
2. **Create AnnotationManager** (3 days)
3. **Inject URL resolver** (1 day)
4. **Extract UI builders** (3 days)
5. **Add JSDoc comments** (2 days)

This gives 70% of benefits with 20% of effort.

---

## Questions for Decision

1. **Timeline:** Full refactor (3 months) or quick wins (2 weeks)?
2. **Backward Compatibility:** Maintain during transition or breaking change?
3. **NPM Package:** Should this become a standalone library?
4. **Documentation:** Generate from JSDoc or write separate guides?
5. **Testing:** How much coverage required before release?

---

## Next Steps

1. Review and approve refactoring plan
2. Create feature branch: `refactor/three-presenter-modular`
3. Set up testing infrastructure
4. Begin Phase 1 (type extraction)
5. Continuous integration during development
6. Regular code reviews at each phase
