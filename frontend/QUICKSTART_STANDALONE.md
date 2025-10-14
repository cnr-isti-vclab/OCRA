# ThreePresenter Standalone - Quick Start Guide

## 🎯 Goal
Use ThreePresenter in a simple HTML page to display 3D models.

## 📦 What You Need

1. **The bundle file**: `three-presenter.umd.js`
2. **Three.js**: Loaded from CDN
3. **Your 3D model(s)**: .glb, .ply, .obj, etc.
4. **An HTML file**: See below

## ⚡ 5-Minute Setup

### Step 1: Build the Bundle

```bash
cd frontend
npm run build:standalone
```

Output: `frontend/dist-standalone/three-presenter.umd.js`

### Step 2: Create HTML File

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My 3D Viewer</title>
  <style>
    body { margin: 0; }
    #viewer { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="viewer"></div>

  <!-- Load Three.js -->
  <script src="https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.min.js"></script>
  
  <!-- Load ThreePresenter -->
  <script src="./three-presenter.umd.js"></script>
  
  <script>
    const { ThreePresenter } = OcraThreePresenter;
    const presenter = new ThreePresenter(
      document.getElementById('viewer')
    );
    
    presenter.loadScene({
      models: [
        { id: 'model1', file: 'your-model.glb' }
      ],
      environment: {
        backgroundColor: '#2a2a2a'
      }
    });
  </script>
</body>
</html>
```

### Step 3: Serve and View

```bash
# Start a local server
python3 -m http.server 8000

# Open browser
# http://localhost:8000
```

## 📂 File Structure

```
my-3d-viewer/
├── index.html                    # Your HTML file
├── three-presenter.umd.js        # From dist-standalone/
├── models/
│   └── your-model.glb           # Your 3D model
└── textures/                     # Optional textures
```

## 🎨 Customization

### Change Background Color
```javascript
presenter.setBackgroundColor('#ffffff');
```

### Show/Hide Ground
```javascript
presenter.setGroundVisible(true);
```

### Multiple Models
```javascript
presenter.loadScene({
  models: [
    { id: 'model1', file: 'model1.glb', position: [0, 0, 0] },
    { id: 'model2', file: 'model2.glb', position: [5, 0, 0] }
  ]
});
```

### Add Annotations
```javascript
const annotationMgr = presenter.getAnnotationManager();
annotationMgr.render([
  {
    id: 'point1',
    label: 'Important Point',
    type: 'point',
    geometry: [0, 1, 0]
  }
]);
```

### Control Models
```javascript
// Hide a model
presenter.setModelVisibility('model1', false);

// Transform a model
presenter.applyModelTransform('model1', {
  position: [1, 2, 3],
  rotation: [0, 90, 0],
  scale: [2, 2, 2]
});
```

## 🔧 Model URLs

By default, models are loaded from `./models/`. To change this:

```javascript
class MyUrlResolver {
  resolveModelUrl(filename) {
    return 'https://my-server.com/models/' + filename;
  }
  resolveTextureUrl(filename) {
    return 'https://my-server.com/textures/' + filename;
  }
}

const presenter = new ThreePresenter(
  container,
  new MyUrlResolver()
);
```

## 📖 Full Documentation

- Complete API: `examples/README.md`
- Build details: `STANDALONE_BUILD.md`
- Working example: `examples/umd-bundle-example.html`

## ✅ Checklist

- [x] Built the bundle (`npm run build:standalone`)
- [x] Copied `three-presenter.umd.js` to your project
- [x] Created HTML file with proper structure
- [x] Loaded Three.js from CDN
- [x] Added container div with ID
- [x] Placed 3D models in accessible location
- [x] Started local HTTP server
- [x] Tested in browser

## 🎉 Done!

You now have a fully functional 3D viewer in a static HTML page. ThreePresenter handles all the complexity of Three.js, camera controls, lighting, and model loading.

## 💡 Tips

- Use `.glb` format for best results (includes textures, materials)
- Models must be served via HTTP (not `file://`)
- Check browser console for errors
- See `umd-bundle-example.html` for a complete working example
- Add UI controls with simple buttons and event listeners

## 🆘 Troubleshooting

**White screen?**
- Check browser console for errors
- Verify model URL is correct
- Ensure HTTP server is running

**Model not loading?**
- Check file path in `resolveModelUrl()`
- Verify file format is supported
- Check CORS headers if loading from different domain

**Need help?**
- See examples in `frontend/examples/`
- Check main OCRA application for reference
