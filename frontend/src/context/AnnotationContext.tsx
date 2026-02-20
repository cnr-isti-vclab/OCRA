/**
 * AnnotationContext
 * Provides global state management for annotations using React Context
 * Handles synchronization between UI, viewers, and backend
 */

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import type { Annotation, SceneDescription } from '../../../shared/scene-types';
import { AnnotationService } from '../services/AnnotationService';

interface AnnotationContextType {
  annotations: Annotation[];
  selectedAnnotationIds: string[];
  isLoading: boolean;
  error: string | null;

  // Annotation CRUD operations
  createAnnotation: (annotation: Annotation) => Promise<void>;
  updateAnnotation: (annotation: Annotation) => Promise<void>;
  deleteAnnotations: (ids: string[]) => Promise<void>;

  // Selection operations
  selectAnnotation: (id: string, multiSelect: boolean) => void;
  setSelectedAnnotationIds: (ids: string[]) => void;
  clearSelection: () => void;

}

const AnnotationContext = createContext<AnnotationContextType | undefined>(undefined);

interface AnnotationProviderProps {
  children: React.ReactNode;
  projectId: string;
  selectedSceneId: string;
  sceneDesc: SceneDescription | null;
}

/**
 * AnnotationProvider component
 * Wraps the app to provide annotation context to all children
 */
export function AnnotationProvider({
  children,
  projectId,
  selectedSceneId,
  sceneDesc
}: AnnotationProviderProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotationService, setAnnotationService] = useState<AnnotationService | null>(null);

  // Initialize or update AnnotationService when projectId or selectedSceneId changes
  useEffect(() => {
    const service = new AnnotationService(projectId, selectedSceneId);
    setAnnotationService(service);
  }, [projectId, selectedSceneId]);

  // Load annotations from sceneDesc
  useEffect(() => {
    if (sceneDesc?.annotations) {
      setAnnotations(sceneDesc.annotations);
    } else {
      setAnnotations([]);
    }
    setSelectedAnnotationIds([]);
  }, [sceneDesc?.projectId, selectedSceneId]); // When scene changes, reset annotations and selection

  /**
   * Create a new annotation
   */
  const createAnnotation = useCallback(
    async (annotation: Annotation) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        await annotationService.createAnnotation(annotation, sceneDesc);

        // Update local state
        setAnnotations(prev => [...prev, annotation]);
        console.log('Annotation created in context:', annotation.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to create annotation:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService]
  );

  /**
   * Update an existing annotation
   */
  const updateAnnotation = useCallback(
    async (annotation: Annotation) => {
      if (!sceneDesc || !annotationService) return;

      setIsLoading(true);
      setError(null);
      try {
        await annotationService.updateAnnotation(annotation, sceneDesc);

        // Update local state
        setAnnotations(prev =>
          prev.map(a => (a.id === annotation.id ? annotation : a))
        );
        console.log('Annotation updated in context:', annotation.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to update annotation:', errorMsg);
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
        await annotationService.deleteAnnotations(ids, sceneDesc);

        // Update local state
        setAnnotations(prev => prev.filter(a => !ids.includes(a.id)));
        setSelectedAnnotationIds(prev => prev.filter(id => !ids.includes(id)));
        console.log('Annotations deleted in context:', ids);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        console.error('Failed to delete annotations:', errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sceneDesc, annotationService]
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


  const value: AnnotationContextType = {
    annotations,
    selectedAnnotationIds,
    isLoading,
    error,
    createAnnotation,
    updateAnnotation,
    deleteAnnotations,
    selectAnnotation,
    setSelectedAnnotationIds,
    clearSelection,
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
