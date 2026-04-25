import type { AnnotationScopeType } from './annotation-types';

export type AnnotationMutationKind =
  | 'geometry.created'
  | 'geometry.updated'
  | 'geometry.erasable'
  | 'geometry.restored'
  | 'data.created'
  | 'data.updated'
  | 'data.erasable'
  | 'data.restored'
  | 'link.created'
  | 'link.erasable'
  | 'link.restored';

export type AnnotationEventResourceType = 'geometry' | 'data' | 'link';

export interface AnnotationEventEntityPayload {
  kind: AnnotationEventResourceType;
  id: string;
  version: number | null;
  referenceType?: AnnotationScopeType | null;
  referenceId?: string | null;
  geometryId?: string | null;
  dataId?: string | null;
  erasable?: boolean | null;
}

export interface AnnotationSocialLockState {
  streamId: string;
  projectId: string;
  sceneId: string;
  sessionId: string;
  userId: string;
  username: string;
  resourceType: AnnotationEventResourceType | null;
  resourceId: string | null;
  activity: string | null;
  startedAt: string;
}

export interface AnnotationConnectedEvent {
  type: 'annotation.connected';
  timestamp: string;
  streamId: string;
  projectId: string;
  sceneId: string | null;
  activeSocialLocks: AnnotationSocialLockState[];
}

export interface AnnotationSocialLockEvent extends AnnotationSocialLockState {
  type: 'annotation.social_lock.started' | 'annotation.social_lock.stopped';
  timestamp: string;
}

export interface AnnotationMutationEvent {
  type: 'annotation.mutated';
  timestamp: string;
  projectId: string;
  sceneId: string | null;
  sessionId: string;
  userId: string;
  username: string;
  mutation: AnnotationMutationKind;
  entity: AnnotationEventEntityPayload;
}

export type AnnotationStreamEvent =
  | AnnotationConnectedEvent
  | AnnotationSocialLockEvent
  | AnnotationMutationEvent;

export interface AnnotationEventStreamQuery {
  sceneId?: string;
}

export interface AnnotationSocialLockRequest {
  sceneId: string;
  streamId: string;
  resourceType?: AnnotationEventResourceType;
  resourceId?: string;
  activity?: string;
}

export interface AnnotationSocialLockResponse {
  success: true;
  event: AnnotationSocialLockEvent;
}