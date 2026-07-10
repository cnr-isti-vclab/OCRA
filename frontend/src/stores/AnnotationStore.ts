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
import {
  createEmptyActiveSelection,
  EMPTY_SELECTION_CRITERIA,
  evaluateActiveSelection,
  getActiveGeometriesForData,
  getActiveResolvedTriples,
  AnnotationStoreMaps,
  type ActiveAnnotationSelection,
  type SelectionCriteria,
} from './annotation-selection';
import type { AnnotationCreationDraft } from '../features/annotation-creation/types';
import { createDefaultCreationDraft } from '../features/annotation-creation/createDefaultCreationDraft';
import {
  buildLinkPairs,
  resolveInitialCreationStep,
  validateCreationDraftForCommit,
  validateCreationSetup,
} from '../features/annotation-creation/annotationCreationValidation';

export type { AnnotationCreationDraft } from '../features/annotation-creation/types';

export type AnnotationStoreActionResult =
  | { ok: true }
  | { ok: false; message: string };

export type AnnotationEntityKind = 'geometry' | 'data' | 'link';

export type {
  ActiveAnnotationSelection,
  AnnotationStoreMaps,
  DataPredicate,
  GeometryPredicate,
  GeometryLabelDisplay,
  LinkPredicate,
  LinkPresence,
  SelectionCriteria,
  SelectionLinkMode,
} from './annotation-selection';

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

export interface AnnotationUpdateOptions {
  expectedVersion?: number;
}

export interface GeometryUpdateOptions extends AnnotationUpdateOptions {
  optimistic?: boolean;
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

function formatDefaultDataLabel(counter: bigint): string {
  return `A${counter.toString().padStart(6, '0')}`;
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
  // Default UX: hide erasable entities (soft-deleted) unless explicitly requested.
  private selectionCriteria: SelectionCriteria = { includeErasable: false };
  private activeSelection: ActiveAnnotationSelection = createEmptyActiveSelection();
  private creationDraft: AnnotationCreationDraft | null = null;

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

  get creationDraftState(): Readonly<AnnotationCreationDraft> | null {
    return this.creationDraft;
  }

  get isCreationWizardActive(): boolean {
    return this.creationDraft !== null
      && (this.creationDraft.step === 'geometry'
        || this.creationDraft.step === 'data'
        || this.creationDraft.step === 'committing');
  }

  initCreationDraft(): void {
    this.creationDraft = createDefaultCreationDraft(this.sceneId);
    this.bump();
  }

  updateCreationDraft(patch: Partial<AnnotationCreationDraft>): void {
    if (!this.creationDraft) {
      return;
    }
    this.creationDraft = { ...this.creationDraft, ...patch };
    this.bump();
  }

  discardCreationDraft(): void {
    if (!this.creationDraft) {
      return;
    }
    this.creationDraft = null;
    this.bump();
  }

  beginCreationWizard(): { ok: true } | { ok: false; message: string } {
    if (!this.creationDraft || this.creationDraft.step !== 'setup') {
      return { ok: false, message: 'Creation setup is not active.' };
    }

    const validation = validateCreationSetup(this.creationDraft);
    if (!validation.ok) {
      return { ok: false, message: validation.message ?? 'Invalid creation setup.' };
    }

    this.creationDraft = {
      ...this.creationDraft,
      step: resolveInitialCreationStep(this.creationDraft),
      draftShapes: [],
      selectedGeometryIds: [],
      selectedDataIds: [],
    };
    this.bump();
    return { ok: true };
  }

  async advanceCreationStep(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.creationDraft) {
      return { ok: false, message: 'No creation session is active.' };
    }

    if (this.creationDraft.step === 'geometry') {
      if (this.creationDraft.dataChoice === 'void') {
        return this.commitCreationDraft();
      }
      this.creationDraft = { ...this.creationDraft, step: 'data' };
      this.bump();
      return { ok: true };
    }

    if (this.creationDraft.step === 'data') {
      return this.commitCreationDraft();
    }

    return { ok: false, message: 'Creation cannot advance from the current step.' };
  }

  async commitCreationDraft(): Promise<AnnotationStoreActionResult> {
    if (!this.creationDraft || this.creationDraft.step === 'setup') {
      return { ok: false, message: 'Creation is not ready to commit.' };
    }

    if (this.isCreating) {
      return { ok: false, message: 'Creation is already in progress.' };
    }

    const draftSnapshot = this.creationDraft;
    const validation = validateCreationDraftForCommit(draftSnapshot);
    if (!validation.ok) {
      return { ok: false, message: validation.message ?? 'Invalid creation draft.' };
    }

    const myGen = this.generation;
    this.isCreating = true;
    this.creationDraft = { ...draftSnapshot, step: 'committing' };
    this.bump();

    const created = {
      geometries: [] as AnnotationGeometry[],
      data: [] as AnnotationData[],
      links: [] as AnnotationLink[],
    };

    try {
      let geometryIds: string[] = [];

      if (draftSnapshot.geometryChoice === 'new') {
        const geometry = await this.client.createGeometry({
          shapes: draftSnapshot.draftShapes,
          referenceType: draftSnapshot.geometryScope.referenceType,
          referenceId: draftSnapshot.geometryScope.referenceId,
        });
        created.geometries.push(geometry);
        if (this.generation !== myGen) {
          await this.revertWizardCommitArtifacts(created);
          this.restoreCreationDraftAfterInterruptedCommit(draftSnapshot, myGen);
          return { ok: false, message: 'Creation was interrupted by a scene reload.' };
        }
        this.geometryMap.set(geometry.id, geometry);
        geometryIds.push(geometry.id);
      } else if (draftSnapshot.geometryChoice === 'search') {
        geometryIds = [...draftSnapshot.selectedGeometryIds];
      }

      let dataIds: string[] = [];

      if (draftSnapshot.dataChoice === 'new') {
        const counter = await this.client.consumeProjectCounter();
        const defaultLabel = formatDefaultDataLabel(counter);
        const requestedLabel = draftSnapshot.newDataLabel.trim();
        const datum = await this.client.createData({
          label: requestedLabel.length > 0 ? requestedLabel : defaultLabel,
          description: draftSnapshot.newDataDescription,
          class: draftSnapshot.newDataClass,
          content: draftSnapshot.newDataContent,
          visibilityType: draftSnapshot.dataVisibility.visibilityType,
          visibilityId: draftSnapshot.dataVisibility.visibilityId,
        });
        created.data.push(datum);
        if (this.generation !== myGen) {
          await this.revertWizardCommitArtifacts(created);
          this.restoreCreationDraftAfterInterruptedCommit(draftSnapshot, myGen);
          return { ok: false, message: 'Creation was interrupted by a scene reload.' };
        }
        this.dataMap.set(datum.id, datum);
        dataIds.push(datum.id);
      } else if (draftSnapshot.dataChoice === 'search') {
        dataIds = [...draftSnapshot.selectedDataIds];
      }

      if (draftSnapshot.geometryChoice !== 'void' && draftSnapshot.dataChoice !== 'void') {
        for (const pair of buildLinkPairs(geometryIds, dataIds)) {
          const link = await this.client.createLink(pair);
          created.links.push(link);
          if (this.generation !== myGen) {
            await this.revertWizardCommitArtifacts(created);
            this.restoreCreationDraftAfterInterruptedCommit(draftSnapshot, myGen);
            return { ok: false, message: 'Creation was interrupted by a scene reload.' };
          }
          this.linkMap.set(link.id, link);
        }
      }

      this.creationDraft = null;
      this.bump();
      return { ok: true };
    } catch (err) {
      if (this.generation === myGen) {
        await this.revertWizardCommitArtifacts(created);
        this.creationDraft = { ...draftSnapshot, step: draftSnapshot.step };
        this.callbacks.onError(err);
        this.bump();
      } else {
        await this.revertWizardCommitArtifacts(created);
        this.restoreCreationDraftAfterInterruptedCommit(draftSnapshot, myGen);
      }
      throw err;
    } finally {
      if (this.creationDraft?.step === 'committing' && this.generation === myGen) {
        this.creationDraft = { ...draftSnapshot, step: draftSnapshot.step };
        this.bump();
      }
      this.isCreating = false;
    }
  }

  get clientRef(): AnnotationApiClient {
    return this.client;
  }

  get sceneScopeId(): string {
    return this.sceneId;
  }

  get currentSelectionCriteria(): Readonly<SelectionCriteria> {
    return this.selectionCriteria;
  }

  get activeAnnotationSelection(): Readonly<ActiveAnnotationSelection> {
    return this.activeSelection;
  }

  /**
   * Sets the query filter for active geometries, data, and links.
   * Re-evaluates immediately against the current store snapshot.
   */
  selectActiveAnnotations(criteria: SelectionCriteria = EMPTY_SELECTION_CRITERIA): void {
    this.selectionCriteria = { ...criteria };
    this.bump();
  }

  getActiveResolvedTriples(): ReturnType<typeof getActiveResolvedTriples> {
    return getActiveResolvedTriples(this.getStoreMaps(), this.activeSelection);
  }

  getActiveGeometriesForData(dataId: string): AnnotationGeometry[] {
    return getActiveGeometriesForData(this.activeSelection)(dataId);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Tear down the current scene (SSE, maps, in-flight writes) and load another scene
   * on a fresh {@link AnnotationApiClient}. Reuses the same store instance and callbacks.
   */
  async loadScene(sceneId: string, includeErasable = false): Promise<void> {
    this.releaseCurrentScene();
    this.sceneId = sceneId;
    this.client = new AnnotationApiClient({ projectId: this.projectId, sceneId });
    await this.init(includeErasable);
  }

  async init(includeErasable = false): Promise<void> {
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
    this.selectionCriteria = { includeErasable: false };
    this.activeSelection = createEmptyActiveSelection();
    this.creationDraft = null;
    if (hadPending) {
      this.callbacks.onEditsCancelled();
    }
    this.bump();
  }

  // ── On-demand loading ─────────────────────────────────────────────────────

  async loadProjectData(includeErasable = false): Promise<void> {
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

  async updateGeometry(
    geometryId: string,
    shapes: AnnotationShape[],
    expectedVersionOrOptions?: number | GeometryUpdateOptions,
  ): Promise<void> {
    const options =
      typeof expectedVersionOrOptions === 'number'
        ? { expectedVersion: expectedVersionOrOptions }
        : expectedVersionOrOptions ?? {};

    await this.optimisticVersionedUpdate({
      kind: 'geometry',
      id: geometryId,
      applyOptimistic: (snapshot) => ({ ...snapshot, shapes }),
      write: (snapshot) =>
        this.client.updateGeometry(geometryId, {
          expectedVersion: options.expectedVersion ?? snapshot.version,
          shapes,
        }),
      mergeSuccess: (current, snapshot, res) => ({
        ...current,
        shapes,
        version: res.version,
        updatedAt: res.updatedAt ?? current.updatedAt ?? snapshot.updatedAt,
      }),
      optimistic: options.optimistic ?? true,
    });
  }

  async updateData(
    dataId: string,
    input: UpdateDataInput,
    options: AnnotationUpdateOptions = {},
  ): Promise<void> {
    await this.optimisticVersionedUpdate({
      kind: 'data',
      id: dataId,
      applyOptimistic: (snapshot) => ({ ...snapshot, ...input }),
      write: (snapshot) =>
        this.client.updateData(dataId, {
          expectedVersion: options.expectedVersion ?? snapshot.version,
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

  /**
   * Demo-only monolithic soft-delete: mark data + linked links + linked geometries erasable.
   * This treats one annotation as a single triplet even though the model is decoupled.
   */
  async markAnnotationTripletErasable(dataId: string): Promise<void> {
    const links = [...this.linkMap.values()].filter(
      (link) => link.dataId === dataId && link.erasableAt === null,
    );

    const geometryIds = [...new Set(links.map((link) => link.geometryId))];

    await Promise.all(links.map((link) => this.markLinkErasable(link.id)));
    await Promise.all(geometryIds.map((geometryId) => this.markGeometryErasable(geometryId)));
    await this.markDataErasable(dataId);
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

      let datum: AnnotationData;
      if (existingDatum) {
        datum = existingDatum;
      } else {
        const counter = await this.client.consumeProjectCounter();
        const defaultLabel = formatDefaultDataLabel(counter);
        const requestedLabel = input.label.trim();

        datum = await this.client.createData({
          label: requestedLabel.length > 0 ? requestedLabel : defaultLabel,
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
    this.creationDraft = null;
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
    optimistic?: boolean;
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

    if (options.optimistic ?? true) {
      this.setEntity(kind, id, options.applyOptimistic(snapshot));
      this.bump();
    }

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

  private restoreCreationDraftAfterInterruptedCommit(
    draftSnapshot: AnnotationCreationDraft,
    myGen: number,
  ): void {
    if (this.generation !== myGen) {
      this.creationDraft = null;
      this.bump();
      return;
    }

    this.creationDraft = { ...draftSnapshot, step: draftSnapshot.step };
    this.bump();
  }

  private async revertWizardCommitArtifacts(created: {
    geometries: AnnotationGeometry[];
    data: AnnotationData[];
    links: AnnotationLink[];
  }): Promise<void> {
    try {
      for (const link of created.links) {
        await this.client.markLinkErasable(link.id, link.version);
      }
      for (const datum of created.data) {
        await this.client.markDataErasable(datum.id, datum.version);
      }
      for (const geometry of created.geometries) {
        await this.client.markGeometryErasable(geometry.id, geometry.version);
      }

      for (const link of created.links) {
        this.linkMap.delete(link.id);
      }
      for (const datum of created.data) {
        this.dataMap.delete(datum.id);
      }
      for (const geometry of created.geometries) {
        this.geometryMap.delete(geometry.id);
      }
      this.bump();
    } catch (compensateErr) {
      console.error('[AnnotationStore] wizard commit rollback failed', compensateErr);
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

  private getStoreMaps(): AnnotationStoreMaps {
    return {
      geometries: this.geometryMap,
      data: this.dataMap,
      links: this.linkMap,
    };
  }

  private recomputeActiveSelection(): void {
    this.activeSelection = evaluateActiveSelection(
      this.getStoreMaps(),
      this.sceneId,
      this.selectionCriteria,
    );
  }

  private bump(): void {
    this.recomputeActiveSelection();
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
