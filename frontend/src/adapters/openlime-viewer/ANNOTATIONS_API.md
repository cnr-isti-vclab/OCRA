# OpenLIMEViewer - Annotations API (CRUD)

## Overview

OpenLIMEViewer.tsx now exposes a complete CRUD (Create, Read, Update, Delete) interface to manage annotations created with OpenLIME's "pencil" tool. Annotations are colored disks that users can create by double-clicking on the viewer when the pencil tool is active.

## TypeScript Interface

```typescript
export interface SimplifiedAnnotation {
  id: string;                  // Unique annotation ID
  label?: string;              // Text label
  description?: string;        // Extended description
  class?: string;              // CSS class
  data?: any;                  // Custom data (includes pos, pencilDiskRadius, etc.)
  publish?: number;            // Publication flag (0 or 1)
  state?: any;                 // Canvas state at creation time
}

export interface OpenLIMEViewerRef {
  // Camera controls
  resetCamera: () => void;
  
  // Annotation CRUD operations
  getAllAnnotations: () => SimplifiedAnnotation[];
  getAnnotationById: (id: string) => SimplifiedAnnotation | null;
  updateAnnotationById: (id: string, updates: Partial<SimplifiedAnnotation>) => SimplifiedAnnotation | null;
  deleteAnnotationById: (id: string) => SimplifiedAnnotation | null;
}
```

## Component Props

### Callbacks for Annotation Events

```typescript
<OpenLIMEViewer
  sceneDesc={sceneDesc}
  digitalAssets={digitalAssets}
  
  // Called when the user creates a new annotation with double-click
  onAnnotationCreated={(annotation) => {
    console.log('New annotation created:', annotation);
    // Save to OCRA database
  }}
  
  // Called when an annotation is modified
  onAnnotationUpdated={(annotation) => {
    console.log('Annotation modified:', annotation);
    // Update in OCRA database
  }}
  
  // Called when an annotation is deleted
  onAnnotationDeleted={(annotation) => {
    console.log('Annotation deleted:', annotation);
    // Remove from OCRA database
  }}
  
  ref={viewerRef}
/>
```

## Methods Exposed via Ref

### 1. Read All Annotations

```typescript
const viewerRef = useRef<OpenLIMEViewerRef>(null);

// Get all annotations
const annotations = viewerRef.current?.getAllAnnotations();
console.log('Total annotations:', annotations);

// Example output:
// [
//   { id: "anno_1", label: "...", data: { pos: {x: 100, y: 200} }, ... },
//   { id: "anno_2", label: "...", data: { pos: {x: 150, y: 250} }, ... }
// ]
```

### 2. Read a Single Annotation

```typescript
const annotationId = "anno_1";
const annotation = viewerRef.current?.getAnnotationById(annotationId);

if (annotation) {
  console.log('Found:', annotation);
  console.log('Position:', annotation.data?.pos);
} else {
  console.log('Annotation not found');
}
```

### 3. Update an Annotation

```typescript
const annotationId = "anno_1";
const updates = {
  label: "Point of interest",
  description: "Important detail on the coin",
  data: {
    ...existingData,
    customField: "custom value"
  }
};

const updated = viewerRef.current?.updateAnnotationById(annotationId, updates);

if (updated) {
  console.log('Annotation updated:', updated);
  // The viewer is automatically redrawn
}
```

### 4. Delete an Annotation

```typescript
const annotationId = "anno_1";
const deleted = viewerRef.current?.deleteAnnotationById(annotationId);

if (deleted) {
  console.log('Annotation deleted:', deleted);
  // The viewer is automatically redrawn
  // The onAnnotationDeleted event will be called
}
```

## Complete Integration Flow with OCRA

### Example: React Component Managing Annotations

```typescript
import React, { useRef, useState, useEffect } from 'react';
import OpenLIMEViewer, { OpenLIMEViewerRef, SimplifiedAnnotation } from './OpenLIMEViewer';

function HDTPage() {
  const viewerRef = useRef<OpenLIMEViewerRef>(null);
  const [annotations, setAnnotations] = useState<SimplifiedAnnotation[]>([]);

  // Handler for new annotations created by the user
  const handleAnnotationCreated = async (annotation: SimplifiedAnnotation) => {
    console.log('📌 New annotation created:', annotation);
    
    // Save to OCRA backend
    try {
      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          annotation: annotation
        })
      });
      
      if (response.ok) {
        // Update local state
        setAnnotations(prev => [...prev, annotation]);
      }
    } catch (error) {
      console.error('Error saving annotation:', error);
    }
  };

  // Handler for modified annotations
  const handleAnnotationUpdated = async (annotation: SimplifiedAnnotation) => {
    console.log('📝 Annotation modified:', annotation);
    
    // Update in OCRA backend
    try {
      await fetch(`/api/annotations/${annotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotation)
      });
      
      // Update local state
      setAnnotations(prev => 
        prev.map(a => a.id === annotation.id ? annotation : a)
      );
    } catch (error) {
      console.error('Error updating annotation:', error);
    }
  };

  // Handler for deleted annotations
  const handleAnnotationDeleted = async (annotation: SimplifiedAnnotation) => {
    console.log('🗑️ Annotation deleted:', annotation);
    
    // Remove from OCRA backend
    try {
      await fetch(`/api/annotations/${annotation.id}`, {
        method: 'DELETE'
      });
      
      // Update local state
      setAnnotations(prev => prev.filter(a => a.id !== annotation.id));
    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  };

  // Load existing annotations from backend
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const response = await fetch(`/api/annotations?projectId=${currentProject.id}`);
        const data = await response.json();
        setAnnotations(data.annotations);
      } catch (error) {
        console.error('Error loading annotations:', error);
      }
    };
    
    loadAnnotations();
  }, [currentProject.id]);

  // Update annotation from OCRA UI
  const updateAnnotationFromUI = (annotationId: string, newLabel: string) => {
    const updated = viewerRef.current?.updateAnnotationById(annotationId, {
      label: newLabel
    });
    
    if (updated) {
      console.log('✅ Annotation updated in viewer');
      // The onAnnotationUpdated event will be automatically called
    }
  };

  // Delete annotation from OCRA UI
  const deleteAnnotationFromUI = (annotationId: string) => {
    const deleted = viewerRef.current?.deleteAnnotationById(annotationId);
    
    if (deleted) {
      console.log('✅ Annotation deleted from viewer');
      // The onAnnotationDeleted event will be automatically called
    }
  };

  return (
    <div>
      <OpenLIMEViewer
        sceneDesc={sceneDesc}
        digitalAssets={digitalAssets}
        onAnnotationCreated={handleAnnotationCreated}
        onAnnotationUpdated={handleAnnotationUpdated}
        onAnnotationDeleted={handleAnnotationDeleted}
        ref={viewerRef}
      />
      
      {/* Annotations control panel */}
      <div className="annotations-panel">
        <h3>Annotations ({annotations.length})</h3>
        {annotations.map(anno => (
          <div key={anno.id} className="annotation-item">
            <span>{anno.label || 'Untitled'}</span>
            <button onClick={() => updateAnnotationFromUI(anno.id, 'New title')}>
              Edit
            </button>
            <button onClick={() => deleteAnnotationFromUI(anno.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Annotation Data Structure

### `data` Field

The `data` field contains pencil annotation-specific information:

```typescript
{
  id: "anno_1",
  label: "Important point",
  description: "Interesting detail",
  data: {
    pos: { x: 123.45, y: 678.90 },      // Coordinates in model space
    pencilDiskRadius: 20,                 // Disk radius in pixels (zoom 1)
    customField: "custom value"           // Custom fields
  },
  state: {
    // Canvas state (layers, camera position, etc.)
  }
}
```

## Technical Notes

### Accessing the Annotation Layer

Internally, OpenLIMEViewer accesses the layer via:
- `uiRef.current._pencilAnnotationLayer` (automatically created by UIBasic)
- The layer is of type `LayerSvgAnnotation` (svg_annotations)
- CRUD methods are already implemented in the layer thanks to your modifications

### OpenLIME Events

The annotation layer emits events that are intercepted:
- `'created'` - emitted when a new annotation is created
- `'updated'` - emitted when an annotation is modified
- `'deleted'` - emitted when an annotation is deleted

### Automatic Redraw

When calling `updateAnnotationById` or `deleteAnnotationById`, the viewer is automatically redrawn by calling `viewerRef.current.redraw()`.

## Test Example

```typescript
// Complete CRUD cycle test
const testAnnotationsCRUD = async () => {
  // 1. Create a new annotation (via user double-click)
  // ... user double-clicks with pencil active ...
  // -> onAnnotationCreated is called
  
  // 2. Read all annotations
  const all = viewerRef.current?.getAllAnnotations();
  console.log('Total:', all?.length);
  
  // 3. Read specific annotation
  const anno = viewerRef.current?.getAnnotationById(all?.[0].id!);
  console.log('First annotation:', anno);
  
  // 4. Update annotation
  const updated = viewerRef.current?.updateAnnotationById(all?.[0].id!, {
    label: 'Modified annotation',
    description: 'Update test'
  });
  console.log('Updated:', updated);
  // -> onAnnotationUpdated is called
  
  // 5. Delete annotation
  const deleted = viewerRef.current?.deleteAnnotationById(all?.[0].id!);
  console.log('Deleted:', deleted);
  // -> onAnnotationDeleted is called
};
```

## Next Steps

To fully integrate with OCRA:

1. **Backend**: Create REST API endpoints to save/read/update/delete annotations in the database
2. **Frontend**: Implement UI panel to display annotation list
3. **Synchronization**: Load existing annotations when opening a project
4. **Validation**: Add annotation data validation
5. **Permissions**: Manage user permissions to modify/delete annotations

## Questions?

For more details on OpenLIME's internal annotation structure, see:
- `node_modules/openlime/src/LayerAnnotation.js`
- `node_modules/openlime/src/LayerSvgAnnotation.js`
- `node_modules/openlime/src/UIBasic.js` (methods `createAnnotationWithDisk`, `toggleAnnotations`)

