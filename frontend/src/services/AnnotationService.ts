/**
 * AnnotationService Service
 * Handles CRUD operations and persistence for annotations
 * Acts as the single source of truth for annotation data
 */

import { Annotation, SceneDescription } from '../../../shared/scene-types';
import { getApiBase } from '../config/oauth';

export class AnnotationService {
  private projectId: string;
  private selectedSceneId: string;

  constructor(projectId: string, selectedSceneId: string) {
    this.projectId = projectId;
    this.selectedSceneId = selectedSceneId;
  }

  /**
   * Create a new annotation and save it to the backend
   */
  async createAnnotation(annotation: Annotation, currentScene: SceneDescription): Promise<Annotation> {
    try {
      const updatedAnnotations = [...(currentScene.annotations || []), annotation];
      const updatedScene = { ...currentScene, annotations: updatedAnnotations };

      const response = await fetch(
        `${getApiBase()}/api/projects/${this.projectId}/hdt/scenes/${this.selectedSceneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedScene)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save annotation to backend');
      }

      console.log('✅ Annotation created:', annotation.id);
      return annotation;
    } catch (error) {
      console.error('❌ Failed to create annotation:', error);
      throw error;
    }
  }

  /**
   * Update an existing annotation
   */
  async updateAnnotation(
    annotation: Annotation,
    currentScene: SceneDescription
  ): Promise<Annotation> {
    try {
      const updatedAnnotations = (currentScene.annotations || []).map(a =>
        a.id === annotation.id ? annotation : a
      );
      const updatedScene = { ...currentScene, annotations: updatedAnnotations };

      const response = await fetch(
        `${getApiBase()}/api/projects/${this.projectId}/hdt/scenes/${this.selectedSceneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedScene)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update annotation on backend');
      }

      console.log('✅ Annotation updated:', annotation.id);
      return annotation;
    } catch (error) {
      console.error('❌ Failed to update annotation:', error);
      throw error;
    }
  }

  /**
   * Delete one or more annotations
   */
  async deleteAnnotations(
    annotationIds: string[],
    currentScene: SceneDescription
  ): Promise<void> {
    try {
      const updatedAnnotations = (currentScene.annotations || []).filter(
        a => !annotationIds.includes(a.id)
      );
      const updatedScene = { ...currentScene, annotations: updatedAnnotations };

      const response = await fetch(
        `${getApiBase()}/api/projects/${this.projectId}/hdt/scenes/${this.selectedSceneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedScene)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete annotations on backend');
      }

      console.log('✅ Annotations deleted:', annotationIds);
    } catch (error) {
      console.error('❌ Failed to delete annotations:', error);
      throw error;
    }
  }

  /**
   * Update the scene ID (when switching scenes)
   */
  updateSceneId(sceneId: string): void {
    this.selectedSceneId = sceneId;
  }
}
