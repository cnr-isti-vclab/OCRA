import type {
  AnnotationConnectedEvent,
  AnnotationEventResourceType,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
} from 'shared/annotation-events';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  AnnotationShape,
} from 'shared/annotation-types';
import {
  AnnotationApiClient,
  AnnotationApiError,
  type AnnotationSceneBundle,
} from '../services/AnnotationApiClient';
import type { AnnotationRealtimeState } from '../services/AnnotationEventsService';

export type AnnotationEntityKind = 'geometry' | 'data' | 'link';

export interface AnnotationStoreMaps {
  geometries: Map<string, AnnotationGeometry>;
  data: Map<string, AnnotationData>;
  links: Map<string, AnnotationLink>;
}

export interface AnnotationStoreMeta {
  loadedDataScopes: Set<string>;
  loadingScopes: Set<string>;
  allProjectDataLoaded: boolean;
}

export interface AnnotationStoreCallbacks {
  onUpdate: () => void;
  onRealtimeStateChange: (state: AnnotationRealtimeState) => void;
  onConflict: (id: string) => void;
  onError: (err: unknown) => void;
  onEditsCancelled: () => void;
  onConnected?: (event: AnnotationConnectedEvent) => void;
  onMutation?: (event: AnnotationMutationEvent) => void;
  onSocialLockStarted?: (event: AnnotationSocialLockEvent) => void;
  onSocialLockStopped?: (event: AnnotationSocialLockEvent) => void;
  onReconnect?: () => void;
}

export interface CreateAnnotationInput {
  shapes: AnnotationShape[];
  label: string;
  description?: string;
  class: string | null;
  content: Record<string, unknown>;
  existingDataId?: string;
}

export interface UpdateDataInput {
  label?: string;
  description?: string;
  class?: string | null;
  content?: Record<string, unknown>;
}

interface VersionedWriteResult {
  success: true;
  version: number;
  updatedAt: string | null;
}

const PROJECT_DATA_SCOPE = '__project__';

function isConflict(err: unknown): boolean {
  return err instanceof AnnotationApiError && err.status === 409;
}

function savingKey(kind: AnnotationEntityKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * In-memory annotation store mirroring MongoDB geometry / data / link collections.
 * Pure TypeScript — no React dependency. Remote DB is source of truth.
 *
 * @see doc/anno-frontend.md
 */
export class AnnotationStore {
  private readonly geometryMap = new Map<string, AnnotationGeometry>();
  private readonly dataMap = new Map<string, AnnotationData>();
  private readonly linkMap = new Map<string, AnnotationLink>();

  private meta: AnnotationStoreMeta = {
    loadedDataScopes: new Set(),
    loadingScopes: new Set(),
    allProjectDataLoaded: false,
  };

  private readonly isSaving = new Set<string>();
  private isCreating = false;
  private generation = 0;
  private realtimeState: AnnotationRealtimeState = 'idle';
  private isLoadingAdditionalData = false;

  private client: AnnotationApiClient;
  private sceneId: string;

  constructor(
    private readonly projectId: string,
    private readonly callbacks: AnnotationStoreCallbacks,
    sceneId: string,
  ) {
    this.sceneId = sceneId;
    this.client = new AnnotationApiClient({ projectId, sceneId });
  }

  get geometriesById(): ReadonlyMap<string, AnnotationGeometry> {
    return this.geometryMap;
  }

  get dataById(): ReadonlyMap<string, AnnotationData> {
    return this.dataMap;
  }

  get linksById(): ReadonlyMap<string, AnnotationLink> {
    return this.linkMap;
  }

  get metaState(): Readonly<AnnotationStoreMeta> {
    return this.meta;
  }

  get currentRealtimeState(): AnnotationRealtimeState {
    return this.realtimeState;
  }

  get loadingAdditionalData(): boolean {
    return this.isLoadingAdditionalData;
  }

  get creating(): boolean {
    return this.isCreating;
  }

  get clientRef(): AnnotationApiClient {
    return this.client;
  }

  get sceneScopeId(): string {
    return this.sceneId;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Tear down the current scene (SSE, maps, in-flight writes) and load another scene
   * on a fresh {@link AnnotationApiClient}. Reuses the same store instance and callbacks.
   */
  async loadScene(sceneId: string, includeErasable = true): Promise<void> {
    this.releaseCurrentScene();
    this.sceneId = sceneId;
    this.client = new AnnotationApiClient({ projectId: this.projectId, sceneId });
    await this.init(includeErasable);
  }

  async init(includeErasable = true): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    this.isSaving.clear();
    this.isCreating = false;
    this.resetMeta();

    try {
      const bundle = await this.client.loadSceneBundle(includeErasable);
      if (this.generation !== myGen) {
        return;
      }
      this.applyBundle(bundle);
      this.bump();

      this.client.connectRealtime({
        onConnected: (event) => {
          this.callbacks.onConnected?.(event);
        },
        onConnectionStateChange: (state) => {
          this.realtimeState = state;
          this.callbacks.onRealtimeStateChange(state);
        },
        onMutation: (event) => {
          this.callbacks.onMutation?.(event);
          void this.processSSEUpdate(event);
        },
        onSocialLockStarted: (event) => {
          this.callbacks.onSocialLockStarted?.(event);
        },
        onSocialLockStopped: (event) => {
          this.callbacks.onSocialLockStopped?.(event);
        },
        onReconnect: () => {
          this.callbacks.onReconnect?.();
          void this.handleReconnect();
        },
      });
    } catch (err) {
      if (this.generation === myGen) {
        this.callbacks.onError(err);
      }
      throw err;
    }
  }

  destroy(): void {
    this.releaseCurrentScene();
  }

  private releaseCurrentScene(): void {
    const hadPending = this.isSaving.size > 0 || this.isCreating;
    this.generation += 1;
    this.isSaving.clear();
    this.isCreating = false;
    this.client.disconnectRealtime();
    this.realtimeState = 'idle';
    this.callbacks.onRealtimeStateChange('idle');
    this.geometryMap.clear();
    this.dataMap.clear();
    this.linkMap.clear();
    this.meta = {
      loadedDataScopes: new Set(),
      loadingScopes: new Set(),
      allProjectDataLoaded: false,
    };
    this.isLoadingAdditionalData = false;
    if (hadPending) {
      this.callbacks.onEditsCancelled();
    }
    this.bump();
  }

  // ── On-demand loading ─────────────────────────────────────────────────────

  async loadProjectData(includeErasable = true): Promise<void> {
    if (this.meta.allProjectDataLoaded || this.meta.loadingScopes.has(PROJECT_DATA_SCOPE)) {
      return;
    }

    this.meta.loadingScopes.add(PROJECT_DATA_SCOPE);
    this.isLoadingAdditionalData = true;
    this.bump();

    const myGen = this.generation;
    try {
      const data = await this.client.loadAllData(includeErasable);
      if (this.generation !== myGen) {
        return;
      }
      for (const datum of data) {
        this.dataMap.set(datum.id, datum);
      }
      this.meta.allProjectDataLoaded = true;
      this.bump();
    } catch (err) {
      if (this.generation === myGen) {
        this.callbacks.onError(err);
      }
      throw err;
    } finally {
      this.meta.loadingScopes.delete(PROJECT_DATA_SCOPE);
      this.isLoadingAdditionalData = this.meta.loadingScopes.size > 0;
      if (this.generation === myGen) {
        this.bump();
      }
    }
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async updateGeometry(geometryId: string, shapes: AnnotationShape[]): Promise<void> {
    await this.optimisticVersionedUpdate({
      kind: 'geometry',
      id: geometryId,
      applyOptimistic: (snapshot) => ({ ...snapshot, shapes }),
      write: (snapshot) =>
        this.client.updateGeometry(geometryId, {
          expectedVersion: snapshot.version,
          shapes,
        }),
      mergeSuccess: (current, snapshot, res) => ({
        ...current,
        shapes,
        version: res.version,
        updatedAt: res.updatedAt ?? current.updatedAt ?? snapshot.updatedAt,
      }),
    });
  }

  async updateData(dataId: string, input: UpdateDataInput): Promise<void> {
    await this.optimisticVersionedUpdate({
      kind: 'data',
      id: dataId,
      applyOptimistic: (snapshot) => ({ ...snapshot, ...input }),
      write: (snapshot) =>
        this.client.updateData(dataId, {
          expectedVersion: snapshot.version,
          ...input,
        }),
      mergeSuccess: (current, snapshot, res, values) => ({
        ...current,
        ...values.patch,
        version: res.version,
        updatedAt: res.updatedAt ?? current.updatedAt ?? snapshot.updatedAt,
      }),
      inputValues: { patch: input },
    });
  }

  async markGeometryErasable(geometryId: string): Promise<void> {
    await this.markEntityErasable('geometry', geometryId);
  }

  async markGeometryNonErasable(geometryId: string): Promise<void> {
    await this.markEntityNonErasable('geometry', geometryId);
  }

  async markDataErasable(dataId: string): Promise<void> {
    await this.markEntityErasable('data', dataId);
  }

  async markDataNonErasable(dataId: string): Promise<void> {
    await this.markEntityNonErasable('data', dataId);
  }

  async markLinkErasable(linkId: string): Promise<void> {
    await this.markEntityErasable('link', linkId);
  }

  async markLinkNonErasable(linkId: string): Promise<void> {
    await this.markEntityNonErasable('link', linkId);
  }

  async createAnnotation(input: CreateAnnotationInput): Promise<void> {
    if (this.isCreating) {
      return;
    }

    let existingDatum: AnnotationData | undefined;
    if (input.existingDataId) {
      existingDatum = this.dataMap.get(input.existingDataId);
      if (!existingDatum) {
        this.callbacks.onError(new Error('data entity not in store'));
        return;
      }
    }

    const myGen = this.generation;
    this.isCreating = true;

    const created: {
      geometry?: AnnotationGeometry;
      datum?: AnnotationData;
      link?: AnnotationLink;
      reusedExistingData: boolean;
    } = { reusedExistingData: Boolean(input.existingDataId) };

    try {
      const geometry = await this.client.createGeometry({
        shapes: input.shapes,
        referenceType: 'scene',
        referenceId: this.sceneId,
      });
      if (this.generation !== myGen) {
        return;
      }
      created.geometry = geometry;
      this.geometryMap.set(geometry.id, geometry);
      this.bump();

      let datum: AnnotationData;
      if (existingDatum) {
        datum = existingDatum;
      } else {
        datum = await this.client.createData({
          label: input.label,
          description: input.description,
          class: input.class,
          content: input.content,
          visibilityType: 'scene',
          visibilityId: this.sceneId,
        });
        if (this.generation !== myGen) {
          await this.compensateFailedCreate(created, myGen);
          return;
        }
        created.datum = datum;
        this.dataMap.set(datum.id, datum);
        this.bump();
      }

      const link = await this.client.createLink({
        geometryId: geometry.id,
        dataId: datum.id,
      });
      if (this.generation !== myGen) {
        await this.compensateFailedCreate(created, myGen);
        return;
      }
      created.link = link;
      this.linkMap.set(link.id, link);
      this.bump();
    } catch (err) {
      if (this.generation === myGen) {
        await this.compensateFailedCreate(created, myGen);
        this.callbacks.onError(err);
      }
      throw err;
    } finally {
      this.isCreating = false;
    }
  }

  // ── Social locks (thin delegates) ─────────────────────────────────────────

  async notifyEditorLockStart(input: {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
    activity?: string;
  }): Promise<void> {
    await this.client.notifyEditorLockStart({
      originScopeType: 'scene',
      originScopeId: this.sceneId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      activity: input.activity,
    });
  }

  async notifyEditorLockStop(input: {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
    activity?: string;
  }): Promise<void> {
    await this.client.notifyEditorLockStop({
      originScopeType: 'scene',
      originScopeId: this.sceneId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      activity: input.activity,
    });
  }

  async notifyPresenceStart(activity?: string): Promise<void> {
    await this.client.notifyPresenceStart({
      originScopeType: 'scene',
      originScopeId: this.sceneId,
      activity,
    });
  }

  async notifyPresenceStop(activity?: string): Promise<void> {
    await this.client.notifyPresenceStop({
      originScopeType: 'scene',
      originScopeId: this.sceneId,
      activity,
    });
  }

  // ── Internal: bundle / SSE / reconnect ────────────────────────────────────

  private applyBundle(bundle: AnnotationSceneBundle): void {
    this.geometryMap.clear();
    this.dataMap.clear();
    this.linkMap.clear();

    for (const geometry of bundle.geometries) {
      this.geometryMap.set(geometry.id, geometry);
    }
    for (const datum of bundle.data) {
      this.dataMap.set(datum.id, datum);
    }
    for (const link of bundle.links) {
      this.linkMap.set(link.id, link);
    }
  }

  private resetMeta(): void {
    this.meta = {
      loadedDataScopes: new Set([this.sceneId]),
      loadingScopes: new Set(),
      allProjectDataLoaded: false,
    };
    this.isLoadingAdditionalData = false;
  }

  private async handleReconnect(): Promise<void> {
    const hadPending = this.isSaving.size > 0 || this.isCreating;
    this.generation += 1;
    const myGen = this.generation;
    this.isSaving.clear();
    this.isCreating = false;
    if (hadPending) {
      this.callbacks.onEditsCancelled();
    }

    this.resetMeta();

    try {
      const bundle = await this.client.loadSceneBundle(true);
      if (this.generation !== myGen) {
        return;
      }
      this.applyBundle(bundle);
      this.bump();
    } catch (err) {
      if (this.generation === myGen) {
        this.callbacks.onError(err);
      }
    }
  }

  private async processSSEUpdate(event: AnnotationMutationEvent): Promise<void> {
    const myGen = this.generation;
    const { kind, id } = event.entity;

    try {
      const fetched = await this.fetchEntity(kind, id);
      if (this.generation !== myGen) {
        return;
      }

      const currentVersion = this.getEntity(kind, id)?.version;
      if (currentVersion !== undefined && fetched.version < currentVersion) {
        return;
      }

      this.setEntity(kind, id, fetched);
      this.bump();
    } catch (err) {
      console.error('[AnnotationStore] failed to process SSE mutation', event, err);
    }
  }

  // ── Internal: optimistic OCC writes ───────────────────────────────────────

  private async optimisticVersionedUpdate<TInput = void>(options: {
    kind: AnnotationEntityKind;
    id: string;
    applyOptimistic: (snapshot: AnnotationGeometry | AnnotationData | AnnotationLink) => AnnotationGeometry | AnnotationData | AnnotationLink;
    write: (snapshot: AnnotationGeometry | AnnotationData | AnnotationLink) => Promise<VersionedWriteResult>;
    mergeSuccess: (
      current: AnnotationGeometry | AnnotationData | AnnotationLink,
      snapshot: AnnotationGeometry | AnnotationData | AnnotationLink,
      res: VersionedWriteResult,
      input: TInput,
    ) => AnnotationGeometry | AnnotationData | AnnotationLink;
    inputValues?: TInput;
  }): Promise<void> {
    const { kind, id } = options;
    const key = savingKey(kind, id);
    if (this.isSaving.has(key)) {
      return;
    }

    const snapshot = this.getEntity(kind, id);
    if (!snapshot) {
      return;
    }

    const myGen = this.generation;
    this.isSaving.add(key);

    this.setEntity(kind, id, options.applyOptimistic(snapshot));
    this.bump();

    try {
      const res = await options.write(snapshot);
      if (this.generation !== myGen) {
        return;
      }

      const current = this.getEntity(kind, id);
      if (!current || res.version >= current.version) {
        this.setEntity(
          kind,
          id,
          options.mergeSuccess(current ?? snapshot, snapshot, res, options.inputValues as TInput),
        );
      }
    } catch (err) {
      if (this.generation !== myGen) {
        return;
      }

      const currentOnError = this.getEntity(kind, id);
      if (!currentOnError || snapshot.version >= currentOnError.version) {
        this.setEntity(kind, id, snapshot);
      }

      if (isConflict(err)) {
        try {
          const server = await this.fetchEntity(kind, id);
          if (this.generation !== myGen) {
            return;
          }
          const current = this.getEntity(kind, id);
          if (!current || server.version >= current.version) {
            this.setEntity(kind, id, server);
          }
        } catch {
          // leave rolled-back snapshot in store
        }
        this.callbacks.onConflict(id);
      } else {
        this.callbacks.onError(err);
      }
      throw err;
    } finally {
      if (this.generation === myGen) {
        this.isSaving.delete(key);
        this.bump();
      }
    }
  }

  private async markEntityErasable(kind: AnnotationEntityKind, id: string): Promise<void> {
    const key = savingKey(kind, id);
    if (this.isSaving.has(key)) {
      return;
    }

    const snapshot = this.getEntity(kind, id);
    if (!snapshot) {
      return;
    }

    const myGen = this.generation;
    this.isSaving.add(key);

    try {
      await this.patchErasable(kind, id, snapshot.version, true);
      if (this.generation !== myGen) {
        return;
      }
      await this.refetchAndApplyIfNewer(kind, id, myGen);
    } catch (err) {
      if (this.generation !== myGen) {
        return;
      }

      if (isConflict(err)) {
        try {
          const server = await this.fetchEntity(kind, id);
          if (this.generation !== myGen) {
            return;
          }
          const current = this.getEntity(kind, id);
          if (!current || server.version >= current.version) {
            this.setEntity(kind, id, server);
          }
        } catch {
          // keep snapshot
        }
        this.callbacks.onConflict(id);
      } else {
        this.callbacks.onError(err);
      }
      throw err;
    } finally {
      if (this.generation === myGen) {
        this.isSaving.delete(key);
        this.bump();
      }
    }
  }

  private async markEntityNonErasable(kind: AnnotationEntityKind, id: string): Promise<void> {
    const key = savingKey(kind, id);
    if (this.isSaving.has(key)) {
      return;
    }

    const snapshot = this.getEntity(kind, id);
    if (!snapshot) {
      return;
    }

    const myGen = this.generation;
    this.isSaving.add(key);

    try {
      await this.patchErasable(kind, id, snapshot.version, false);
      if (this.generation !== myGen) {
        return;
      }
      await this.refetchAndApplyIfNewer(kind, id, myGen);
    } catch (err) {
      if (this.generation !== myGen) {
        return;
      }

      if (isConflict(err)) {
        try {
          const server = await this.fetchEntity(kind, id);
          if (this.generation !== myGen) {
            return;
          }
          const current = this.getEntity(kind, id);
          if (!current || server.version >= current.version) {
            this.setEntity(kind, id, server);
          }
        } catch {
          // keep snapshot
        }
        this.callbacks.onConflict(id);
      } else {
        this.callbacks.onError(err);
      }
      throw err;
    } finally {
      if (this.generation === myGen) {
        this.isSaving.delete(key);
        this.bump();
      }
    }
  }

  private async patchErasable(
    kind: AnnotationEntityKind,
    id: string,
    expectedVersion: number,
    erasable: boolean,
  ): Promise<VersionedWriteResult> {
    switch (kind) {
      case 'geometry':
        return erasable
          ? this.client.markGeometryErasable(id, expectedVersion)
          : this.client.markGeometryNonErasable(id, expectedVersion);
      case 'data':
        return erasable
          ? this.client.markDataErasable(id, expectedVersion)
          : this.client.markDataNonErasable(id, expectedVersion);
      case 'link':
        return erasable
          ? this.client.markLinkErasable(id, expectedVersion)
          : this.client.markLinkNonErasable(id, expectedVersion);
    }
  }

  private async refetchAndApplyIfNewer(
    kind: AnnotationEntityKind,
    id: string,
    myGen: number,
  ): Promise<void> {
    const fetched = await this.fetchEntity(kind, id);
    if (this.generation !== myGen) {
      return;
    }
    const current = this.getEntity(kind, id);
    if (!current || fetched.version >= current.version) {
      this.setEntity(kind, id, fetched);
      this.bump();
    }
  }

  private async compensateFailedCreate(
    created: {
      geometry?: AnnotationGeometry;
      datum?: AnnotationData;
      link?: AnnotationLink;
      reusedExistingData: boolean;
    },
    myGen: number,
  ): Promise<void> {
    if (this.generation !== myGen) {
      return;
    }

    try {
      if (created.link) {
        await this.client.markLinkErasable(created.link.id, created.link.version);
      }
      if (created.datum && !created.reusedExistingData) {
        await this.client.markDataErasable(created.datum.id, created.datum.version);
      }
      if (created.geometry) {
        await this.client.markGeometryErasable(created.geometry.id, created.geometry.version);
      }

      if (this.generation !== myGen) {
        return;
      }

      if (created.link) {
        this.linkMap.delete(created.link.id);
      }
      if (created.datum && !created.reusedExistingData) {
        this.dataMap.delete(created.datum.id);
      }
      if (created.geometry) {
        this.geometryMap.delete(created.geometry.id);
      }
      this.bump();
    } catch (compensateErr) {
      console.error('[AnnotationStore] compensating delete failed', compensateErr);
    }
  }

  // ── Map helpers ───────────────────────────────────────────────────────────

  private getEntity(
    kind: AnnotationEntityKind,
    id: string,
  ): AnnotationGeometry | AnnotationData | AnnotationLink | undefined {
    switch (kind) {
      case 'geometry':
        return this.geometryMap.get(id);
      case 'data':
        return this.dataMap.get(id);
      case 'link':
        return this.linkMap.get(id);
    }
  }

  private setEntity(
    kind: AnnotationEntityKind,
    id: string,
    entity: AnnotationGeometry | AnnotationData | AnnotationLink,
  ): void {
    switch (kind) {
      case 'geometry':
        this.geometryMap.set(id, entity as AnnotationGeometry);
        break;
      case 'data':
        this.dataMap.set(id, entity as AnnotationData);
        break;
      case 'link':
        this.linkMap.set(id, entity as AnnotationLink);
        break;
    }
  }

  private async fetchEntity(
    kind: AnnotationEntityKind,
    id: string,
  ): Promise<AnnotationGeometry | AnnotationData | AnnotationLink> {
    switch (kind) {
      case 'geometry':
        return this.client.getGeometry(id);
      case 'data':
        return this.client.getData(id);
      case 'link':
        return this.client.getLink(id);
    }
  }

  private bump(): void {
    this.callbacks.onUpdate();
  }
}

export function createAnnotationStore(
  projectId: string,
  sceneId: string,
  callbacks: AnnotationStoreCallbacks,
): AnnotationStore {
  return new AnnotationStore(projectId, callbacks, sceneId);
}
