# ThreePresenter Examples

Simple standalone examples demonstrating ThreePresenter API usage.

## Examples

### 1. Basic Example (`basic.html`)

Minimal example showing the core ThreePresenter API (~71 lines).

**Features:**
- 🎮 Interactive 3D viewer (drag to rotate, scroll to zoom)
- 📦 Declarative scene loading with `loadScene()`
- � Uses default `./assets` folder (no configuration needed)
- ✨ Model visibility control and stats retrieval

**How to run:**
```bash
# From the frontend directory
./node_modules/.bin/vite
# Then open: http://localhost:5173/src/lib/three-presenter/examples/basic.html
```

**Note:** Requires Vite dev server for TypeScript compilation.

## What's Demonstrated

- Simple API: `new ThreePresenter('viewer')`
- Default file resolution from `./assets` folder
- Scene description pattern
- Model manipulation (`setModelVisibility`, `getModelStats`)

## File Structure

```
examples/
├── README.md       # This file
├── basic.html      # Minimal ThreePresenter example
└── assets/
    └── venus.glb   # 3D model
```

## Coming Soon

- `advanced.html` - Annotations and custom UI controls
- `custom-resolver.html` - Custom file URL resolvers
- `react-example.tsx` - React integration

---

These examples are **standalone** and don't depend on the OCRA application.
