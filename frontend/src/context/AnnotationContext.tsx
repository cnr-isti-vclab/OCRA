/**
 * AnnotationContext
 * Provides global state management for annotations using React Context
 * Handles synchronization between UI, viewers, and backend
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import type { ViewerAnnotation, SceneDescription } from '../../../shared/scene-types';
import type { AnnotationEventResourceType, AnnotationMutationEvent } from 'shared/annotation-events';
import { AnnotationService } from '../services/AnnotationService';
import { AnnotationEventsService, type AnnotationRealtimeState } from '../services/AnnotationEventsService';

interface AnnotationContextType {
  annotations: ViewerAnnotation[];
  selectedAnnotationIds: string[];
  isLoading: boolean;
  error: string | null;
  realtimeState: AnnotationRealtimeState;
  lastRemoteMutation: AnnotationMutationEvent | null;

  // Annotation CRUD operations
  createAnnotation: (annotation: ViewerAnnotation) => Promise<void>;
  updateAnnotation: (annotation: ViewerAnnotation) => Promise<void>;
  updateAnnotationGeometry: (id: string, geometry: ViewerAnnotation['geometry']) => Promise<void>;
  updateAnnotationData: (id: string, data: Partial<Omit<ViewerAnnotation, 'id' | 'geometry'>>) => Promise<void>;
  deleteAnnotations: (ids: string[]) => Promise<void>;

  // Selection operations
  selectAnnotation: (id: string, multiSelect: boolean) => void;
  setSelectedAnnotationIds: (ids: string[]) => void;
  clearSelection: () => void;

  notifyEditingStart: (input?: { resourceType?: AnnotationEventResourceType; resourceId?: string; activity?: string }) => Promise<boolean>;
  notifyEditingStop: (input?: { resourceType?: AnnotationEventResourceType; resourceId?: string; activity?: string }) => Promise<boolean>;

}

const AnnotationContext = createContext<AnnotationContextType | undefined>(undefined);

interface AnnotationProviderProps {
  children: React.ReactNode;
  projectId: string;
  selectedSceneId: string;
  sceneDesc: SceneDescription | null;
  user: any;
  reloadScene?: () => Promise<void>;
}

/**
 * AnnotationProvider component
 * Wraps the app to provide annotation context to all children
 */
export function AnnotationProvider({
  children,
  projectId,
  selectedSceneId,
  sceneDesc,
  user,
  reloadScene,
}: AnnotationProviderProps) {
  const [annotations, setAnnotations] = useState<ViewerAnnotation[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotationService, setAnnotationService] = useState<AnnotationService | null>(null);
  const [realtimeState, setRealtimeState] = useState<AnnotationRealtimeState>('idle');
  const [lastRemoteMutation, setLastRemoteMutation] = useState<AnnotationMutationEvent | null>(null);
  const annotationEventsRef = useRef<AnnotationEventsService | null>(null);
  const pendingReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize or update AnnotationService when projectId or selectedSceneId changes
  useEffect(() => {
    const service = new AnnotationService(projectId, selectedSceneId);
    setAnnotationService(service);
  }, [projectId, selectedSceneId]);

  const scheduleSceneReload = useCallback(() => {
    if (!reloadScene || pendingReloadRef.current) {
      return;
    }

    pendingReloadRef.current = setTimeout(async () => {
      pendingReloadRef.current = null;
      try {
        await reloadScene();
      } catch (reloadError) {
        console.error('Failed to refresh scene after annotation realtime event:', reloadError);
      }
    }, 250);
  }, [reloadScene]);

  useEffect(() => {
    if (!projectId || !selectedSceneId) {
      annotationEventsRef.current?.disconnect();
      annotationEventsRef.current = null;
      return;
    }

    const service = new AnnotationEventsService(projectId, selectedSceneId);
    annotationEventsRef.current = service;
    service.connect({
      onConnectionStateChange: setRealtimeState,
      onMutation: (event) => {
        setLastRemoteMutation(event);
        scheduleSceneReload();
      },
      onReconnect: () => {
        scheduleSceneReload();
      },
    });

    return () => {
      service.disconnect();
      if (pendingReloadRef.current) {
        clearTimeout(pendingReloadRef.current);
        pendingReloadRef.current = null;
      }
    };
  }, [projectId, selectedSceneId, scheduleSceneReload]);

  // Load annotations from sceneDesc whenever it or the selected scene changes
  useEffect(() => {
    if (sceneDesc?.annotations) {
      // Use spread so React always gets a new array reference
      setAnnotations([...sceneDesc.annotations]);
    } else {
      setAnnotations([]);
    }
    setSelectedAnnotationIds([]);
  }, [sceneDesc, selectedSceneId]); // Re-sync whenever sceneDesc object itself changes

  /**
   * Create a new annotation
   */
  const createAnnotation = useCallback(
    async (annotation: ViewerAnnotation) => {
      annotation.createdBy = user.username;
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        // Build the updated annotations list (new array so React detects the change)
        const nextAnnotations = [...(sceneDesc.annotations || []), annotation];
        sceneDesc.annotations = nextAnnotations;
        await annotationService.createAnnotation(annotation, sceneDesc);

        setAnnotations([...nextAnnotations]);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to create annotation:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService, annotations]
  );

  /**
   * Update an existing annotation
   */
  const updateAnnotation = useCallback(
    async (annotation: ViewerAnnotation) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        console.log('AnnotationContext: Update annotation', annotation);
        // Update scene description with possible new annotations before calling the service
        const updated = await annotationService.updateAnnotation(annotation, sceneDesc);

        // Update local state — always produce a new array so React re-renders
        const nextAnnotations = (sceneDesc.annotations || []).map(a => (a.id === updated.id ? updated : a));
        sceneDesc.annotations = nextAnnotations;
        setAnnotations([...nextAnnotations]);

        console.log('Annotation updated in context:', annotations);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to update annotation:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService, annotations]
  );


  /**
   * Update only the geometry of an annotation
   */
  const updateAnnotationGeometry = useCallback(
    async (id: string, geometry: ViewerAnnotation['geometry']) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        // Update scene description with possible new annotations before calling the service
        const updated = await annotationService.updateAnnotationGeometry(id, geometry, sceneDesc);

        // Update local state — always produce a new array so React re-renders
        const nextAnnotations = (sceneDesc.annotations || []).map(a => (a.id === id ? updated : a));
        sceneDesc.annotations = nextAnnotations;
        setAnnotations([...nextAnnotations]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to update annotation geometry:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService, annotations]
  );

  /**
   * Update only the data/metadata of an annotation
   */
  const updateAnnotationData = useCallback(
    async (id: string, data: Partial<Omit<ViewerAnnotation, 'id' | 'geometry'>>) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        // Update scene description with possible new annotations before calling the service
        const updated = await annotationService.updateAnnotationData(id, data, sceneDesc);

        // Update local state — always produce a new array so React re-renders
        const nextAnnotations = (sceneDesc.annotations || []).map(a => (a.id === id ? updated : a));
        sceneDesc.annotations = nextAnnotations;
        setAnnotations([...nextAnnotations]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to update annotation data:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService]
  );

  /**
   * Delete one or more annotations
   */
  const deleteAnnotations = useCallback(
    async (ids: string[]) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        // Update scene description with possible new annotations before calling the service
        await annotationService.deleteAnnotations(ids, sceneDesc);

        // Update local state — always produce a new array so React re-renders
        const nextAnnotations = (sceneDesc.annotations || []).filter(a => !ids.includes(a.id));
        sceneDesc.annotations = nextAnnotations;
        setAnnotations([...nextAnnotations]);
        setSelectedAnnotationIds(prev => prev.filter(id => !ids.includes(id)));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to delete annotations:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService, annotations]
  );

  /**
   * Select annotation(s)
   * If multiSelect is true, add to selection; otherwise, replace selection
   */
  const selectAnnotation = useCallback((id: string, multiSelect: boolean) => {
    setSelectedAnnotationIds(prev => {
      if (multiSelect) {
        // Toggle selection
        if (prev.includes(id)) {
          return prev.filter(aid => aid !== id);
        } else {
          return [...prev, id];
        }
      } else {
        // Single selection
        return [id];
      }
    });
  }, []);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedAnnotationIds([]);
  }, []);

  const notifyEditingStart = useCallback(
    async (input?: { resourceType?: AnnotationEventResourceType; resourceId?: string; activity?: string }) => {
      return await annotationEventsRef.current?.notifyEditingStart(input) ?? false;
    },
    [],
  );

  const notifyEditingStop = useCallback(
    async (input?: { resourceType?: AnnotationEventResourceType; resourceId?: string; activity?: string }) => {
      return await annotationEventsRef.current?.notifyEditingStop(input) ?? false;
    },
    [],
  );

  const value: AnnotationContextType = {
    annotations,
    selectedAnnotationIds,
    isLoading,
    error,
    realtimeState,
    lastRemoteMutation,
    createAnnotation,
    updateAnnotation,
    updateAnnotationGeometry,
    updateAnnotationData,
    deleteAnnotations,
    selectAnnotation,
    setSelectedAnnotationIds,
    clearSelection,
    notifyEditingStart,
    notifyEditingStop,
  };

  return (
    <AnnotationContext value={value}>
      {children}
    </AnnotationContext>
  );
}

/**
 * Hook to use the AnnotationContext
 * Must be called within a component wrapped by AnnotationProvider
 */
export function useAnnotations(): AnnotationContextType {
  const context = useContext(AnnotationContext);
  if (!context) {
    throw new Error('useAnnotations must be used within an AnnotationProvider');
  }
  return context;
}
