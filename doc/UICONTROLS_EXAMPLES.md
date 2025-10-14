# UIControlsBuilder Usage Examples

## Overview

The `UIControlsBuilder` provides a clean, declarative way to create button-based UI controls for 3D viewers. This guide shows various usage patterns.

---

## Basic Usage

### Example 1: Simple Viewer Controls

```typescript
import { UIControlsBuilder } from './three-presenter';

// Create a simple control panel
const controls = new UIControlsBuilder()
  .setContainer({ position: 'top-left' })
  .addButton({
    id: 'home',
    icon: 'bi-house',
    title: 'Reset View',
    onClick: () => presenter.resetCamera()
  })
  .addButton({
    id: 'screenshot',
    icon: 'bi-camera',
    title: 'Screenshot',
    onClick: () => presenter.takeScreenshot()
  })
  .build();

// Attach to viewer
viewerMount.appendChild(controls.container);

// Access individual buttons
const homeButton = controls.buttons.get('home');
homeButton?.addEventListener('custom-event', () => {});
```

---

## Advanced Usage

### Example 2: Horizontal Toolbar

```typescript
const toolbar = new UIControlsBuilder()
  .setContainer({
    position: 'top-right',
    direction: 'horizontal',
    gap: 'gap-3'
  })
  .addButtons([
    { id: 'play', icon: 'bi-play-fill', title: 'Play', onClick: startAnimation },
    { id: 'pause', icon: 'bi-pause-fill', title: 'Pause', onClick: pauseAnimation },
    { id: 'stop', icon: 'bi-stop-fill', title: 'Stop', onClick: stopAnimation }
  ])
  .build();
```

### Example 3: Multiple Control Panels

```typescript
// Top-left: View controls
const viewControls = new UIControlsBuilder()
  .setContainer({ position: 'top-left' })
  .addButtons([
    { id: 'reset', icon: 'bi-house', title: 'Reset', onClick: reset },
    { id: 'fit', icon: 'bi-fullscreen', title: 'Fit All', onClick: fitAll }
  ])
  .build();

// Bottom-right: Tool controls
const toolControls = new UIControlsBuilder()
  .setContainer({ position: 'bottom-right', direction: 'horizontal' })
  .addButtons([
    { id: 'measure', icon: 'bi-rulers', title: 'Measure', onClick: measure },
    { id: 'section', icon: 'bi-scissors', title: 'Section', onClick: section }
  ])
  .build();

mount.appendChild(viewControls.container);
mount.appendChild(toolControls.container);
```

---

## Custom HTML Content

### Example 4: Complex Button Icons

```typescript
const controls = new UIControlsBuilder()
  .addButton({
    id: 'custom',
    icon: 'bi-star', // Fallback
    customHTML: `
      <div style="position: relative; width: 20px; height: 20px;">
        <i class="bi bi-sun" style="position: absolute; top: 0; left: 0;"></i>
        <i class="bi bi-moon" style="position: absolute; top: 5px; left: 5px;"></i>
      </div>
    `,
    title: 'Day/Night Toggle',
    onClick: toggleDayNight
  })
  .build();
```

---

## Dynamic Visibility

### Example 5: Show/Hide Buttons

```typescript
const controls = new UIControlsBuilder()
  .addButton({
    id: 'advanced',
    icon: 'bi-gear',
    title: 'Advanced',
    onClick: showAdvanced,
    visible: false // Hidden initially
  })
  .build();

// Show button when needed
function enableAdvancedMode() {
  const advancedBtn = controls.buttons.get('advanced');
  if (advancedBtn) {
    advancedBtn.style.display = 'block';
  }
}

// Hide button
function disableAdvancedMode() {
  const advancedBtn = controls.buttons.get('advanced');
  if (advancedBtn) {
    advancedBtn.style.display = 'none';
  }
}
```

---

## Utility Functions

### Example 6: Quick Single Button

```typescript
import { createButton } from './three-presenter';

// Create a standalone button
const helpButton = createButton({
  id: 'help',
  icon: 'bi-question-circle',
  title: 'Help',
  onClick: () => showHelp()
});

// Add anywhere
document.body.appendChild(helpButton);
```

### Example 7: Quick Panel with Utility Function

```typescript
import { createButtonPanel } from './three-presenter';

const panel = createButtonPanel(
  { position: 'bottom-left', direction: 'horizontal' },
  [
    { id: 'undo', icon: 'bi-arrow-counterclockwise', title: 'Undo', onClick: undo },
    { id: 'redo', icon: 'bi-arrow-clockwise', title: 'Redo', onClick: redo }
  ]
);

mount.appendChild(panel.container);
```

---

## Button State Management

### Example 8: Toggle Button States

```typescript
const controls = new UIControlsBuilder()
  .addButton({
    id: 'light',
    icon: 'bi-lightbulb-fill',
    title: 'Toggle Light',
    onClick: () => toggleLight()
  })
  .build();

const lightButton = controls.buttons.get('light');

function toggleLight() {
  isLightOn = !isLightOn;
  
  // Update button appearance
  if (lightButton) {
    if (isLightOn) {
      lightButton.classList.add('btn-warning');
      lightButton.classList.remove('btn-light');
    } else {
      lightButton.classList.add('btn-light');
      lightButton.classList.remove('btn-warning');
    }
  }
}
```

---

## Positioning Options

### Example 9: All Four Positions

```typescript
// Top-left
const topLeft = new UIControlsBuilder()
  .setContainer({ position: 'top-left' })
  .addButton({ id: 'tl', icon: 'bi-1-square', title: 'Top Left', onClick: () => {} })
  .build();

// Top-right
const topRight = new UIControlsBuilder()
  .setContainer({ position: 'top-right' })
  .addButton({ id: 'tr', icon: 'bi-2-square', title: 'Top Right', onClick: () => {} })
  .build();

// Bottom-left
const bottomLeft = new UIControlsBuilder()
  .setContainer({ position: 'bottom-left' })
  .addButton({ id: 'bl', icon: 'bi-3-square', title: 'Bottom Left', onClick: () => {} })
  .build();

// Bottom-right
const bottomRight = new UIControlsBuilder()
  .setContainer({ position: 'bottom-right' })
  .addButton({ id: 'br', icon: 'bi-4-square', title: 'Bottom Right', onClick: () => {} })
  .build();
```

---

## Custom Styling

### Example 10: Custom Button Classes

```typescript
const controls = new UIControlsBuilder()
  .addButton({
    id: 'danger',
    icon: 'bi-trash',
    title: 'Delete',
    onClick: confirmDelete,
    className: 'btn-danger' // Override default btn-light
  })
  .addButton({
    id: 'success',
    icon: 'bi-check',
    title: 'Confirm',
    onClick: confirm,
    className: 'btn-success'
  })
  .build();
```

---

## Integration with ThreePresenter

### Example 11: Full Integration

```typescript
import { ThreePresenter } from './components/ThreePresenter';
import { UIControlsBuilder } from './components/three-presenter';

class MyViewer {
  private presenter: ThreePresenter;
  private controls: UIControlsResult;
  
  constructor(mount: HTMLDivElement) {
    // Create presenter
    this.presenter = new ThreePresenter(mount);
    
    // Create custom controls
    this.controls = new UIControlsBuilder()
      .setContainer({ position: 'top-left' })
      .addButtons([
        { id: 'home', icon: 'bi-house', title: 'Home', onClick: () => this.reset() },
        { id: 'info', icon: 'bi-info-circle', title: 'Info', onClick: () => this.showInfo() }
      ])
      .build();
    
    // Attach controls
    mount.appendChild(this.controls.container);
  }
  
  private reset() {
    this.presenter.resetCamera();
  }
  
  private showInfo() {
    console.log('Model info:', this.presenter.currentScene);
  }
}
```

---

## Reusability

### Example 12: Create Reusable Button Sets

```typescript
// Define reusable button configurations
const VIEWER_BUTTONS = {
  standard: [
    { id: 'home', icon: 'bi-house', title: 'Reset View' },
    { id: 'screenshot', icon: 'bi-camera', title: 'Screenshot' },
    { id: 'fullscreen', icon: 'bi-fullscreen', title: 'Fullscreen' }
  ],
  
  camera: [
    { id: 'perspective', icon: 'bi-box', title: 'Perspective' },
    { id: 'orthographic', icon: 'bi-square', title: 'Orthographic' }
  ],
  
  lighting: [
    { id: 'light', icon: 'bi-lightbulb-fill', title: 'Toggle Light' },
    { id: 'env', icon: 'bi-globe', title: 'Environment' }
  ]
};

// Use in different viewers
function createViewerControls(presenter: ThreePresenter, preset: keyof typeof VIEWER_BUTTONS) {
  const configs = VIEWER_BUTTONS[preset].map(btn => ({
    ...btn,
    onClick: () => handleAction(btn.id, presenter)
  }));
  
  return new UIControlsBuilder()
    .addButtons(configs)
    .build();
}

// Usage
const standardControls = createViewerControls(presenter1, 'standard');
const cameraControls = createViewerControls(presenter2, 'camera');
```

---

## Tips and Best Practices

### 1. Button IDs
- Use descriptive, unique IDs
- Keep IDs consistent across your app
- Consider namespacing: `'viewer.home'`, `'editor.save'`

### 2. Icons
- Use Bootstrap Icons for consistency
- Check icon availability in your project
- Fallback to text if needed

### 3. Event Handlers
- Keep handlers simple
- Delegate to class methods for complex logic
- Consider debouncing for expensive operations

### 4. Layout
- Vertical for tools (< 8 buttons)
- Horizontal for navigation (< 5 buttons)
- Multiple panels for >10 buttons

### 5. Accessibility
- Provide descriptive titles
- Consider keyboard shortcuts
- Test with screen readers

---

## TypeScript Integration

### Example 13: Type-Safe Button Configuration

```typescript
import type { ButtonConfig } from './three-presenter';

// Define button configuration type
type ViewerButton = 'home' | 'screenshot' | 'fullscreen';

// Create type-safe configuration
const buttonConfigs: Record<ViewerButton, ButtonConfig> = {
  home: {
    id: 'home',
    icon: 'bi-house',
    title: 'Reset View',
    onClick: () => presenter.resetCamera()
  },
  screenshot: {
    id: 'screenshot',
    icon: 'bi-camera',
    title: 'Take Screenshot',
    onClick: () => presenter.takeScreenshot()
  },
  fullscreen: {
    id: 'fullscreen',
    icon: 'bi-fullscreen',
    title: 'Toggle Fullscreen',
    onClick: () => toggleFullscreen()
  }
};

// Use with type safety
const controls = new UIControlsBuilder()
  .addButtons(Object.values(buttonConfigs))
  .build();
```

---

## Conclusion

The `UIControlsBuilder` provides a flexible, declarative way to create UI controls. Key benefits:

- ✅ **Clean API**: Builder pattern for readability
- ✅ **Flexible**: Multiple positioning and layout options
- ✅ **Reusable**: Works in any project
- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Consistent**: Bootstrap styling built-in

For more details, see:
- `doc/REFACTORING_PHASE4_COMPLETE.md` - Full documentation
- `frontend/src/components/three-presenter/UIControlsBuilder.ts` - Source code
