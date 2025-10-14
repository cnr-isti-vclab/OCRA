# ThreePresenter UI Controls API

**Date:** October 15, 2025

## Overview

ThreePresenter includes built-in UI buttons for common 3D viewer controls. **All buttons are hidden by default** and must be explicitly shown using the API.

## Design Philosophy

**Explicit Control:** Buttons are hidden by default, giving you complete control over which UI elements to display. This allows for:
- Minimal interfaces by default
- Progressive disclosure of features
- Custom UI configurations per use case
- Clean screenshots without UI clutter

## Available Buttons

The following UI buttons are available:

| Button Name | Icon | Function |
|------------|------|----------|
| `home` | 🏠 | Reset camera to initial position |
| `light` | 💡 | Toggle headlight on/off |
| `lightPosition` | ☀️ | Adjust light position |
| `env` | 🌍 | Toggle environment lighting |
| `screenshot` | 📷 | Take screenshot |
| `camera` | 📦 | Toggle perspective/orthographic camera |
| `annotation` | 📌 | Enable annotation mode |

## API Methods

### `setButtonVisible(buttonName, visible)`

Show or hide a specific button.

```typescript
// Hide the annotation button
presenter.setButtonVisible('annotation', false);

// Show the screenshot button
presenter.setButtonVisible('screenshot', true);

// Hide the camera toggle button
presenter.setButtonVisible('camera', false);
```

**Parameters:**
- `buttonName` (string): Name of the button (see table above)
- `visible` (boolean): `true` to show, `false` to hide

### `setAllButtonsVisible(visible)`

Show or hide all buttons at once.

```typescript
// Hide all UI buttons for a clean view
presenter.setAllButtonsVisible(false);

// Show all UI buttons
presenter.setAllButtonsVisible(true);
```

**Parameters:**
- `visible` (boolean): `true` to show all buttons, `false` to hide all

### `setAnnotationButtonVisible(visible)` *(Legacy)*

Original method for showing/hiding just the annotation button. Still available for backward compatibility.

```typescript
presenter.setAnnotationButtonVisible(false);
```

## Usage Examples

### Example 1: Basic Setup

Show essential controls after loading the scene:

```typescript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(sceneDescription);

// Show basic navigation controls
presenter.setButtonVisible('home', true);
presenter.setButtonVisible('screenshot', true);
```

### Example 2: Full UI

Enable all available buttons:

```typescript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(sceneDescription);

// Show all buttons
presenter.setAllButtonsVisible(true);
```

### Example 3: Minimal UI

Show only home button for simple navigation:

```typescript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(sceneDescription);

// Only show the home button
presenter.setButtonVisible('home', true);
```

### Example 4: View-Only Mode

No buttons at all for a pure viewing experience:

```typescript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(sceneDescription);

// Don't show any buttons - just the 3D model
// (This is actually the default behavior)
```

### Example 5: Progressive Disclosure
### Example 3: Screenshot-Ready Mode

Hide all UI elements before taking a screenshot:

```typescript
// Hide all buttons
presenter.setAllButtonsVisible(false);

// Take screenshot
// ... user captures screenshot ...

// Restore UI
presenter.setAllButtonsVisible(true);
```

### Example 5: Progressive Disclosure

Show buttons based on user interaction level:

```typescript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(sceneDescription);

// Start with basic controls only
presenter.setButtonVisible('home', true);
presenter.setButtonVisible('screenshot', true);

// Later, enable advanced features when user requests them
document.getElementById('advancedMode').addEventListener('click', () => {
  presenter.setButtonVisible('light', true);
  presenter.setButtonVisible('lightPosition', true);
  presenter.setButtonVisible('env', true);
  presenter.setButtonVisible('camera', true);
  presenter.setButtonVisible('annotation', true);
});
```

## Button State Behavior

- Buttons maintain their functional state even when hidden
- Hiding the annotation button automatically exits annotation mode
- All buttons use `display: flex` (shown) or `display: none` (hidden)
- Direct button element access is still available via `presenter.homeButton`, etc.

## Direct Element Access

If you need more control, you can access the button elements directly:

```typescript
// Change button style
presenter.homeButton.style.opacity = '0.5';

// Disable a button
presenter.screenshotButton.disabled = true;

// Add custom classes
presenter.lightButton.classList.add('custom-highlight');
```

## Considerations

- **Accessibility**: Hidden buttons are removed from the DOM flow (`display: none`)
- **State Management**: Button visibility is independent of their functional state
- **Error Handling**: Invalid button names log a warning to the console
- **Performance**: Showing/hiding buttons has negligible performance impact

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Custom UI Controls</title>
</head>
<body>
  <div id="viewer"></div>
  <div id="ui-controls">
    <button onclick="toggleMinimalMode()">Toggle Minimal Mode</button>
  </div>

  <script type="module">
    import { ThreePresenter } from './ThreePresenter.js';

    const presenter = new ThreePresenter('viewer');
    let isMinimal = false;

    // Load scene
    await presenter.loadScene({
      projectId: 'example',
      models: [{ id: 'model', file: 'model.glb', visible: true }]
    });

    // Toggle between full and minimal UI
    window.toggleMinimalMode = () => {
      isMinimal = !isMinimal;
      
      if (isMinimal) {
        // Minimal: only home and screenshot
        presenter.setAllButtonsVisible(false);
        presenter.setButtonVisible('home', true);
        presenter.setButtonVisible('screenshot', true);
      } else {
        // Full: all buttons
        presenter.setAllButtonsVisible(true);
      }
    };
  </script>
</body>
</html>
```

## Summary

The ThreePresenter UI Controls API provides flexible control over the built-in button visibility:

- ✅ **7 built-in buttons** for common 3D viewer operations
- ✅ **Granular control** with `setButtonVisible()`
- ✅ **Batch operations** with `setAllButtonsVisible()`
- ✅ **Direct access** to button elements for custom styling
- ✅ **Smart behavior** (e.g., auto-exit annotation mode)

This API allows you to tailor the UI to your specific use case, from minimal view-only modes to full-featured editors.
