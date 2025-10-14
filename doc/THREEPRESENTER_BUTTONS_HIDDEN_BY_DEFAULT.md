# UI Buttons Hidden by Default - Design Change

**Date:** October 15, 2025  
**Status:** ✅ Complete

## Summary

Changed ThreePresenter to hide all UI buttons by default, requiring explicit calls to `setButtonVisible()` to show them.

## Motivation

**Problem:** Buttons were visible by default, making it difficult to create minimal interfaces or control which buttons appear.

**Solution:** Hide all buttons by default, giving developers explicit control over UI visibility.

## Changes Made

### 1. ThreePresenter.ts - Button Configurations

**Before:**
```typescript
const buttonConfigs: ButtonConfig[] = [
  {
    id: 'home',
    icon: 'bi-house',
    title: 'Reset camera view',
    onClick: () => this.resetCamera()
    // visible: true (implicit default)
  },
  // ... other buttons
  {
    id: 'annotation',
    icon: 'bi-pencil',
    title: 'Add annotation',
    onClick: () => this.togglePickingMode(),
    visible: false // Only annotation was hidden
  }
];
```

**After:**
```typescript
const buttonConfigs: ButtonConfig[] = [
  {
    id: 'home',
    icon: 'bi-house',
    title: 'Reset camera view',
    onClick: () => this.resetCamera(),
    visible: false // Now explicitly hidden
  },
  // ... all buttons with visible: false
];
```

### 2. ThreeJSViewer.tsx - OCRA Adapter

Updated the React adapter to show buttons after scene loads:

```typescript
presenterRef.current.loadScene(sceneDesc, false)
  .then(() => {
    // Show UI buttons after scene is loaded
    if (presenterRef.current) {
      presenterRef.current.setButtonVisible('home', true);
      presenterRef.current.setButtonVisible('light', true);
      presenterRef.current.setButtonVisible('lightPosition', true);
      presenterRef.current.setButtonVisible('env', true);
      presenterRef.current.setButtonVisible('screenshot', true);
      presenterRef.current.setButtonVisible('camera', true);
      // Note: annotation button controlled separately
    }
  })
```

### 3. basic.html - Standalone Example

Added Bootstrap CSS/Icons and explicit button visibility:

```html
<!-- Bootstrap CSS and Icons (required for UI buttons) -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
```

```javascript
presenter.loadScene(sceneDescription)
  .then(() => {
    // Show desired buttons
    presenter.setButtonVisible('home', true);
    presenter.setButtonVisible('light', true);
  });
```

### 4. Documentation Updates

Updated `THREEPRESENTER_UI_CONTROLS.md`:
- Emphasized buttons are hidden by default
- Added "Design Philosophy" section
- Updated examples to reflect new behavior
- Removed confusing hide/show toggle examples

## Benefits

### 1. Explicit Control
Developers must consciously choose which buttons to display:
```typescript
// Clear and intentional
presenter.setButtonVisible('home', true);
presenter.setButtonVisible('screenshot', true);
```

### 2. Minimal by Default
Clean interface without unwanted UI:
```typescript
// No buttons shown - perfect for embedding
await presenter.loadScene(scene);
```

### 3. Progressive Disclosure
Show features as users need them:
```typescript
// Start minimal
presenter.setButtonVisible('home', true);

// Add features later
if (userLevel === 'advanced') {
  presenter.setAllButtonsVisible(true);
}
```

### 4. Consistent Pattern
Matches common UI library patterns (explicit show/hide):
```typescript
// Similar to modal.show(), dialog.open(), etc.
presenter.setButtonVisible('camera', true);
```

## Migration Guide

### For OCRA Application

✅ **No changes needed** - The adapter automatically shows buttons after scene loads.

### For Standalone Examples

**Before:**
```javascript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(scene);
// Buttons automatically visible
```

**After:**
```javascript
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(scene);
// Explicitly show desired buttons
presenter.setButtonVisible('home', true);
presenter.setButtonVisible('screenshot', true);
```

### For Custom Implementations

**Option 1: Show All**
```javascript
await presenter.loadScene(scene);
presenter.setAllButtonsVisible(true);
```

**Option 2: Show Specific**
```javascript
await presenter.loadScene(scene);
presenter.setButtonVisible('home', true);
presenter.setButtonVisible('camera', true);
```

**Option 3: No Buttons**
```javascript
await presenter.loadScene(scene);
// Don't call setButtonVisible - buttons stay hidden
```

## Breaking Changes

⚠️ **Yes - Visual Change**

**Impact:** Buttons no longer appear automatically after `loadScene()`

**Who's Affected:**
- Standalone examples (fixed)
- OCRA application (fixed in adapter)
- External users (need to add `setButtonVisible()` calls)

**Severity:** Low - Easy fix with clear API

## Testing

### Verified

✅ OCRA application - Buttons show correctly after scene loads  
✅ Standalone example - Buttons appear when explicitly shown  
✅ TypeScript compilation - No errors  
✅ Button functionality - All buttons work when visible  
✅ Hide/show toggle - `setButtonVisible()` works correctly  

### Test Scenarios

1. **Default Behavior**
   ```typescript
   const presenter = new ThreePresenter('viewer');
   await presenter.loadScene(scene);
   // Result: No buttons visible ✅
   ```

2. **Show Single Button**
   ```typescript
   await presenter.loadScene(scene);
   presenter.setButtonVisible('home', true);
   // Result: Only home button visible ✅
   ```

3. **Show All Buttons**
   ```typescript
   await presenter.loadScene(scene);
   presenter.setAllButtonsVisible(true);
   // Result: All buttons visible ✅
   ```

4. **OCRA Integration**
   ```typescript
   // In React component
   <ThreeJSViewer sceneDesc={scene} />
   // Result: Standard buttons visible ✅
   ```

## Files Modified

1. **frontend/src/lib/three-presenter/src/ThreePresenter.ts**
   - Added `visible: false` to all button configs
   - Added comment explaining default behavior

2. **frontend/src/adapters/three-presenter/ThreeJSViewer.tsx**
   - Added `.then()` handler after `loadScene()`
   - Calls `setButtonVisible()` for standard buttons

3. **frontend/src/lib/three-presenter/examples/basic.html**
   - Added Bootstrap CSS and Icons CDN links
   - Added `setButtonVisible()` calls in `.then()`

4. **doc/THREEPRESENTER_UI_CONTROLS.md**
   - Updated overview section
   - Added "Design Philosophy" section
   - Revised all examples

## API Consistency

The API now follows a consistent pattern:

```typescript
// Everything starts hidden/disabled
const presenter = new ThreePresenter('viewer');
await presenter.loadScene(scene);

// Explicitly enable what you need
presenter.setButtonVisible('home', true);
presenter.setModelVisibility('venus', true);
presenter.setGroundVisible(true);
```

All visibility controls now default to hidden/false and require explicit activation.

## Future Considerations

Possible enhancements:

1. **Config Object**
   ```typescript
   new ThreePresenter('viewer', {
     buttons: ['home', 'screenshot'], // Auto-show these
     fileResolver: customResolver
   });
   ```

2. **Presets**
   ```typescript
   ThreePresenter.create('viewer', 'minimal'); // home only
   ThreePresenter.create('viewer', 'full');    // all buttons
   ```

3. **Builder Pattern**
   ```typescript
   new ThreePresenter('viewer')
     .withButtons(['home', 'light'])
     .withFileResolver(resolver)
     .build();
   ```

## Summary

This change improves the library's API by:

✅ Making UI state explicit rather than implicit  
✅ Reducing visual clutter by default  
✅ Giving developers full control  
✅ Following established UI library patterns  
✅ Enabling minimal interfaces easily  

The OCRA application continues to work unchanged, while standalone examples now have cleaner, more intentional UI code.
