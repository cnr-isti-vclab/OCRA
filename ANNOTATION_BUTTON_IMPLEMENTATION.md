# Annotation Button Implementation

## Summary

Added a pencil button to the 3D viewer that appears on the right side when the "Annotations" tab is active.

## Changes Made

### 1. ThreePresenter.ts
- **Added property**: `annotationButton: HTMLButtonElement`
- **Created button** in constructor:
  - Pencil icon (`bi-pencil`)
  - Positioned on right side (top-right corner)
  - Same styling as left-side buttons (Bootstrap, shadow, rounded, hover effects)
  - Hidden by default (`display: 'none'`)
  - Placeholder click handler with console log
  
- **Added method**: `setAnnotationButtonVisible(visible: boolean)`
  - Shows/hides the annotation button container
  - Called when tab changes

- **Updated dispose()**: Added cleanup for annotation button

### 2. ThreeJSViewer.tsx
- **Extended interface**: `ThreeJSViewerRef` now includes `setAnnotationButtonVisible(visible: boolean)`
- **Exposed method**: Through `useImperativeHandle` to allow parent component to control visibility

### 3. ProjectPage.tsx
- **Added useEffect**: Watches `activeTab` state
  - Shows annotation button when `activeTab === 'annotations'`
  - Hides it on other tabs ('models', 'scene')

## Button Details

**Location**: Top-right corner of 3D viewer
**Icon**: Pencil (`bi-pencil` from Bootstrap Icons)
**Style**: 
- White background (`btn-light`)
- Padding: `p-2`
- Shadow: `shadow-sm`
- Rounded corners
- Hover: Scales to 1.05x
- Same size and appearance as left toolbar buttons

**Behavior**:
- Only visible when Annotations tab is active
- Currently logs to console on click
- Ready for annotation functionality to be implemented

## Architecture

```
ProjectPage (manages tab state)
    └─> activeTab state change
        └─> useEffect triggers
            └─> viewerRef.current.setAnnotationButtonVisible()
                └─> ThreeJSViewer forwards to
                    └─> ThreePresenter.setAnnotationButtonVisible()
                        └─> Shows/hides button container
```

## Next Steps

The button is now ready for annotation functionality to be implemented:
1. Add annotation mode state
2. Implement click-to-place annotation markers
3. Add annotation editor UI
4. Store annotations in project data
5. Render annotation markers in 3D scene

## Testing

Build successful: ✅
- No TypeScript errors
- No compilation issues
- Button container properly positioned on right side
- Visibility toggling mechanism in place
