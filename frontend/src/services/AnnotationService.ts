/**
 * AnnotationService Service
 * Handles CRUD operations and persistence for annotations
 * Acts as the single source of truth for annotation data
 */

import { ViewerAnnotation, SceneDescription } from '../../../shared/scene-types';
import { getApiBase } from '../config/oauth';

export class AnnotationService {
  private projectId: string;
  private selectedSceneId: string;

  constructor(projectId: string, selectedSceneId: string) {
    this.projectId = projectId;
    this.selectedSceneId = selectedSceneId;
  }

  /**
   * Create a new annotation and save it to the backend.
   * currentScene is the scene description with the new annotation added.
   */
  async createAnnotation(annotation: ViewerAnnotation, currentScene: SceneDescription): Promise<ViewerAnnotation> {
    try {
      const response = await fetch(
        `${getApiBase()}/api/projects/${this.projectId}/hdt/scenes/${this.selectedSceneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          //         body: JSON.stringify(updatedScene)
          body: JSON.stringify(currentScene)
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
    annotation: ViewerAnnotation,
    currentScene: SceneDescription
  ): Promise<ViewerAnnotation> {
    try {
      const response = await fetch(
        `${getApiBase()}/api/projects/${this.projectId}/hdt/scenes/${this.selectedSceneId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentScene)
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
   * Update only the geometry of an annotation
   */
  async updateAnnotationGeometry(
    id: string,
    geometry: ViewerAnnotation['geometry'],
    currentScene: SceneDescription
  ): Promise<ViewerAnnotation> {
    console.log('AnnotationService: updateAnnotationGeometry(): Updating  ', id, ' scene annotations ', currentScene.annotations)
    const annotation = currentScene.annotations?.find(a => a.id === id);
    if (!annotation) {
      console.error(`Service error: updateAnnotationGeometry(): Annotation ${id} not found in`, currentScene.annotations);
      throw new Error(`Annotation ${id} not found`);
    } else {
      console.log(`Service info: updateAnnotationGeometry(): Found annotation ${id}`);
    }

    const updatedAnnotation: ViewerAnnotation = {
      ...annotation,
      geometry
    };

    return this.updateAnnotation(updatedAnnotation, currentScene);
  }

  /**
   * Update only the data/metadata of an annotation
   */
  async updateAnnotationData(
    id: string,
    data: Partial<Omit<ViewerAnnotation, 'id' | 'geometry'>>,
    currentScene: SceneDescription
  ): Promise<ViewerAnnotation> {
    const annotation = currentScene.annotations?.find(a => a.id === id);
    if (!annotation) {
      console.error(`Service error: updateAnnotationData(): Annotation ${id} not found in`, currentScene.annotations);
      throw new Error(`Annotation ${id} not found`);
    }

    const updatedAnnotation: ViewerAnnotation = {
      ...annotation,
      ...data
    };

    return this.updateAnnotation(updatedAnnotation, currentScene);
  }

  /**
   * Update the scene ID (when switching scenes)
   */
  updateSceneId(sceneId: string): void {
    this.selectedSceneId = sceneId;
  }
}
