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
import type { PrimaryAnnotationSelection } from '../types/annotationSelection';
import type { AnnotationCreationDraft, AnnotationCreationRememberedSetup } from '../features/annotation-creation/types';
import { createDefaultCreationDraft } from '../features/annotation-creation/createDefaultCreationDraft';
import { flushCreationDraftGeometry } from '../features/annotation-creation/creationDraftGeometryFlush';
import { formatCreationCommitError } from '../features/annotation-creation/formatCreationCommitError';
import {
  applyRememberedCreationSetup,
  extractCreationSetup,
  lastCreatedGeometry,
  patchTouchesCreationSetup,
} from '../features/annotation-creation/rememberCreationSetup';
import {
  allowsMultipleDataSelection,
  allowsMultipleGeometrySelection,
  buildLinkPairs,
  canAddMoreData,
  emptyPendingData,
  pendingDataAsCreated,
  resolveCreatedDataForCommit,
  resolveCreatedGeometriesForCommit,
  canBeginCreationWizard,
  validateCreationDraftForCommit,
  validateCreationStep,
} from '../features/annotation-creation/annotationCreationValidation';
import { filterGeometriesForCreationSearch } from '../features/annotation-creation/filterCreationCandidates';
import type { AnnotationDeletionDraft } from '../features/annotation-deletion/types';
import { createDefaultDeletionDraft } from '../features/annotation-deletion/createDefaultDeletionDraft';
import {
  applyDeletionIntentAutoLink,
  validateDeletionSetup,
} from '../features/annotation-deletion/annotationDeletionValidation';
import {
  nonErasableLinksForData,
  nonErasableLinksForGeometry,
} from '../features/annotation-deletion/annotationDeletionCardinality';
import {
  buildPendingResolution,
  expandBasketForEndpointOneToOne,
  expandBasketForFanOut,
  expandBasketForSelectedLinks,
  linkIdsForCounterparts,
  needsCardinalityResolution,
} from '../features/annotation-deletion/expandDeletionBasket';
import {
  deselectDataFromDeletionBasket as computeDataDeselection,
  deselectGeometryFromDeletionBasket as computeGeometryDeselection,
} from '../features/annotation-deletion/deselectFromDeletionBasket';
import { canConfirmDeletionBasket } from '../features/annotation-deletion/annotationDeletionBasket';
import { buildDeletionCommitPlan } from '../features/annotation-deletion/buildDeletionCommitPlan';
import { formatDeletionCommitError } from '../features/annotation-deletion/formatDeletionCommitError';
import {
  pruneLockedFromDeletionBasket,
  type DeletionLockPruneContext,
} from '../features/annotation-deletion/pruneLockedFromDeletionBasket';
import {
  DELETION_NO_LINKS_MESSAGE,
  isEntityBlockedForDeletion,
} from '../features/annotation-deletion/isEntityBlockedForDeletion';

export type { AnnotationCreationDraft } from '../features/annotation-creation/types';
export type { AnnotationDeletionDraft } from '../features/annotation-deletion/types';

export type DeletionBasketAddResult =
  | { ok: true }
  | { ok: false; message: string }
  | { ok: true; pendingResolution: true };

export type AnnotationStoreActionResult =
  | { ok: true; message?: string }
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
  private isDeleting = false;
  private generation = 0;
  private realtimeState: AnnotationRealtimeState = 'idle';
  private isLoadingAdditionalData = false;

  private client: AnnotationApiClient;
  private sceneId: string;
  // Default UX: hide erasable entities (soft-deleted) unless explicitly requested.
  private selectionCriteria: SelectionCriteria = { showErased: false };
  private activeSelection: ActiveAnnotationSelection = createEmptyActiveSelection();
  private creationDraft: AnnotationCreationDraft | null = null;
  private rememberedCreationSetup: AnnotationCreationRememberedSetup | null = null;
  private deletionDraft: AnnotationDeletionDraft | null = null;

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

  /** Read all active links before reviewing deletion consequences across scenes. */
  async loadProjectLinksForDeletion(): Promise<AnnotationLink[]> {
    return this.client.loadProjectLinks();
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

  get deleting(): boolean {
    return this.isDeleting;
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

  get deletionDraftState(): Readonly<AnnotationDeletionDraft> | null {
    return this.deletionDraft;
  }

  get isDeletionWizardActive(): boolean {
    return this.deletionDraft !== null
      && (this.deletionDraft.step === 'selecting'
        || this.deletionDraft.step === 'committing');
  }

  initCreationDraft(): void {
    if (this.deletionDraft) {
      return;
    }
    let draft = createDefaultCreationDraft(this.sceneId);
    if (this.rememberedCreationSetup) {
      draft = applyRememberedCreationSetup(draft, this.rememberedCreationSetup);
    }
    this.creationDraft = draft;
    this.bump();
  }

  updateCreationDraft(patch: Partial<AnnotationCreationDraft>): void {
    if (!this.creationDraft) {
      return;
    }
    this.creationDraft = { ...this.creationDraft, ...patch };
    if (patchTouchesCreationSetup(patch)) {
      this.rememberedCreationSetup = extractCreationSetup(this.creationDraft);
    }
    this.bump();
  }

  discardCreationDraft(): void {
    if (!this.creationDraft) {
      return;
    }
    this.rememberedCreationSetup = extractCreationSetup(this.creationDraft);
    this.creationDraft = null;
    this.bump();
  }

  beginCreationWizard(): { ok: true } | { ok: false; message: string } {
    if (this.isDeletionWizardActive) {
      return { ok: false, message: 'Finish or cancel deletion before creating.' };
    }
    if (!this.creationDraft) {
      return { ok: false, message: 'Creation draft is not active.' };
    }
    if (this.creationDraft.step === 'committing') {
      return { ok: false, message: 'Creation is already committing.' };
    }

    if (!canBeginCreationWizard(this.creationDraft)) {
      return { ok: false, message: 'Geometry and data scopes are required.' };
    }

    // Draft already opens on the geometry step; clear transient results if re-begun.
    if (this.creationDraft.step === 'geometry') {
      this.bump();
      return { ok: true };
    }

    this.creationDraft = {
      ...this.creationDraft,
      step: 'geometry',
      geometryMode: null,
      dataMode: null,
      createdGeometries: [],
      selectedGeometryIds: [],
      createdData: [],
      selectedDataIds: [],
      ...emptyPendingData(),
    };
    this.bump();
    return { ok: true };
  }

  /** Start at Data choose to link existing records to selected viewer geometries. */
  beginLinkExistingDataForGeometries(geometryIds: readonly string[]): { ok: true } | { ok: false; message: string } {
    const selectedGeometryIds = [...new Set(geometryIds)];
    if (selectedGeometryIds.length === 0) return { ok: false, message: 'Select at least one geometry first.' };
    if (this.isDeletionWizardActive) return { ok: false, message: 'Finish or cancel deletion before creating.' };
    if (this.isCreationWizardActive) return { ok: false, message: 'Finish or cancel the current creation first.' };
    let draft = createDefaultCreationDraft(this.sceneId);
    if (this.rememberedCreationSetup) draft = applyRememberedCreationSetup(draft, this.rememberedCreationSetup);
    this.creationDraft = {
      ...draft,
      step: 'data',
      geometryMode: 'choose',
      dataMode: 'choose',
      selectedGeometryIds,
      createdGeometries: [],
      selectedDataIds: [],
      createdData: [],
      ...emptyPendingData(),
    };
    this.rememberedCreationSetup = extractCreationSetup(this.creationDraft);
    this.bump();
    return { ok: true };
  }

  initDeletionDraft(): void {
    if (this.isCreationWizardActive || this.isDeletionWizardActive) {
      return;
    }
    if (this.creationDraft) {
      this.rememberedCreationSetup = extractCreationSetup(this.creationDraft);
      this.creationDraft = null;
    }
    this.deletionDraft = createDefaultDeletionDraft();
    this.bump();
  }

  updateDeletionDraft(patch: Partial<AnnotationDeletionDraft>): void {
    if (!this.deletionDraft) {
      return;
    }

    const intentPatch = applyDeletionIntentAutoLink(patch, this.deletionDraft);
    this.deletionDraft = {
      ...this.deletionDraft,
      ...patch,
      ...intentPatch,
    };
    this.bump();
  }

  discardDeletionDraft(): void {
    if (!this.deletionDraft) {
      return;
    }
    this.deletionDraft = null;
    this.bump();
  }

  beginDeletionWizard(
    intent?: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
  ): { ok: true } | { ok: false; message: string } {
    if (this.isCreationWizardActive) {
      return { ok: false, message: 'Finish or cancel creation before deleting.' };
    }
    if (!this.deletionDraft || this.deletionDraft.step !== 'setup') {
      return { ok: false, message: 'Deletion setup is not active.' };
    }

    const nextIntent = intent
      ? applyDeletionIntentAutoLink(intent, this.deletionDraft)
      : {
        deleteLink: this.deletionDraft.deleteLink,
        deleteGeometry: this.deletionDraft.deleteGeometry,
        deleteData: this.deletionDraft.deleteData,
      };

    const validation = validateDeletionSetup(nextIntent);
    if (!validation.ok) {
      return { ok: false, message: validation.message ?? 'Invalid deletion setup.' };
    }

    this.deletionDraft = {
      ...this.deletionDraft,
      ...nextIntent,
      step: 'selecting',
      targetKind: null,
      targetId: null,
      candidateLinkIds: [],
      candidateGeometryIds: [],
      candidateDataIds: [],
      restoreGeometryIds: [],
      restoreDataIds: [],
      selectionMessage: null,
      pendingResolution: null,
    };
    this.bump();
    return { ok: true };
  }

  /** Start unlink/delete with a user-selected endpoint as the explicit target. */
  beginDeletionForTarget(
    target: PrimaryAnnotationSelection,
  ): DeletionBasketAddResult {
    if (this.isCreationWizardActive) {
      return { ok: false, message: 'Finish or cancel creation before deleting.' };
    }
    if (this.isDeletionWizardActive) {
      return { ok: false, message: 'Finish or cancel the current deletion first.' };
    }

    this.deletionDraft = createDefaultDeletionDraft();
    const beginResult = this.beginDeletionWizard({
      deleteLink: true,
      deleteGeometry: target.kind === 'geometry',
      deleteData: target.kind === 'data',
    });
    if (!beginResult.ok) {
      return beginResult;
    }
    return target.kind === 'geometry'
      ? this.addGeometryToDeletionBasket(target.id)
      : this.addDataToDeletionBasket(target.id);
  }

  /**
   * Advances setup → selecting when an intent is already on the draft.
   * Prefer {@link beginDeletionWizard} with an explicit intent from the setup grid.
   */
  advanceDeletionStep(): { ok: true } | { ok: false; message: string } {
    if (!this.deletionDraft) {
      return { ok: false, message: 'No deletion session is active.' };
    }
    if (this.deletionDraft.step === 'setup') {
      return this.beginDeletionWizard();
    }
    return { ok: true };
  }

  private ensureDeletionSelecting(): AnnotationDeletionDraft | null {
    if (!this.deletionDraft || this.deletionDraft.step !== 'selecting') {
      return null;
    }
    return this.deletionDraft;
  }

  private mergeUniqueIds(current: string[], additions: string[]): string[] {
    const next = new Set(current);
    for (const id of additions) {
      next.add(id);
    }
    return [...next];
  }

  private finishDeletionBasketAdd(
    draft: AnnotationDeletionDraft,
    next: Pick<
      AnnotationDeletionDraft,
      'candidateLinkIds' | 'candidateGeometryIds' | 'candidateDataIds'
    > & Partial<Pick<AnnotationDeletionDraft, 'targetKind' | 'targetId'>>,
  ): DeletionBasketAddResult {
    this.deletionDraft = {
      ...draft,
      ...next,
      selectionMessage: null,
      pendingResolution: null,
    };
    this.bump();
    return { ok: true };
  }

  private failDeletionBasketAdd(
    draft: AnnotationDeletionDraft,
    message: string,
  ): DeletionBasketAddResult {
    this.deletionDraft = {
      ...draft,
      selectionMessage: message,
    };
    this.bump();
    return { ok: false, message };
  }

  private beginDeletionPendingResolution(
    draft: AnnotationDeletionDraft,
    endpointKind: 'geometry' | 'data',
    endpointId: string,
    incident: ReturnType<typeof nonErasableLinksForGeometry>,
    modal: 'fanOut' | 'linkResolution' | 'pickCounterparts',
  ): DeletionBasketAddResult {
    this.deletionDraft = {
      ...draft,
      selectionMessage: null,
      pendingResolution: buildPendingResolution(endpointKind, endpointId, incident, modal),
    };
    this.bump();
    return { ok: true, pendingResolution: true };
  }

  /**
   * Geometry-led basket add (Geometry+Link or full triplet).
   * 1:N opens pendingResolution (fan-out or link resolution) instead of adding.
   */
  addGeometryToDeletionBasket(geometryId: string): DeletionBasketAddResult {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return { ok: false, message: 'Deletion selection is not active.' };
    }
    if (draft.pendingResolution) {
      return { ok: false, message: 'Finish or cancel the current multi-link selection first.' };
    }
    if (!draft.deleteGeometry) {
      return this.failDeletionBasketAdd(draft, 'Geometry is not part of the current delete intent.');
    }
    if (!this.geometryMap.has(geometryId)) {
      return this.failDeletionBasketAdd(draft, 'Geometry not found in this scene.');
    }

    if (draft.deleteLink && draft.deleteGeometry && !draft.deleteData) {
      const incident = nonErasableLinksForGeometry(this.linkMap.values(), geometryId);
      return this.finishDeletionBasketAdd(draft, {
        targetKind: 'geometry',
        targetId: geometryId,
        candidateGeometryIds: [geometryId],
        candidateDataIds: [],
        candidateLinkIds: incident.length === 1 ? [incident[0]!.id] : [],
      });
    }

    // Geometry-only (no Link): leave strong links so the endpoint becomes Ghost.
    if (!draft.deleteLink) {
      return this.finishDeletionBasketAdd(draft, {
        candidateGeometryIds: this.mergeUniqueIds(draft.candidateGeometryIds, [geometryId]),
        candidateLinkIds: draft.candidateLinkIds,
        candidateDataIds: draft.candidateDataIds,
      });
    }

    const incident = nonErasableLinksForGeometry(this.linkMap.values(), geometryId);
    // Orphan geometry (created without links yet): add endpoint only.
    if (incident.length === 0) {
      return this.finishDeletionBasketAdd(draft, {
        candidateGeometryIds: this.mergeUniqueIds(draft.candidateGeometryIds, [geometryId]),
        candidateLinkIds: draft.candidateLinkIds,
        candidateDataIds: draft.candidateDataIds,
      });
    }

    if (incident.length > 1) {
      return this.beginDeletionPendingResolution(
        draft,
        'geometry',
        geometryId,
        incident,
        'pickCounterparts',
      );
    }

    const link = incident[0]!;
    return this.finishDeletionBasketAdd(
      draft,
      expandBasketForEndpointOneToOne(
        draft,
        'geometry',
        geometryId,
        link,
        this.linkMap.values(),
      ),
    );
  }

  /**
   * Data-led basket add (Data+Link or full triplet).
   * 1:N opens pendingResolution (fan-out or link resolution) instead of adding.
   */
  addDataToDeletionBasket(dataId: string): DeletionBasketAddResult {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return { ok: false, message: 'Deletion selection is not active.' };
    }
    if (draft.pendingResolution) {
      return { ok: false, message: 'Finish or cancel the current multi-link selection first.' };
    }
    if (!draft.deleteData) {
      return this.failDeletionBasketAdd(draft, 'Data is not part of the current delete intent.');
    }
    if (!this.dataMap.has(dataId)) {
      return this.failDeletionBasketAdd(draft, 'Annotation data not found.');
    }

    if (draft.deleteLink && draft.deleteData && !draft.deleteGeometry) {
      const incident = nonErasableLinksForData(this.linkMap.values(), dataId);
      return this.finishDeletionBasketAdd(draft, {
        targetKind: 'data',
        targetId: dataId,
        candidateGeometryIds: [],
        candidateDataIds: [dataId],
        candidateLinkIds: incident.length === 1 ? [incident[0]!.id] : [],
      });
    }

    // Data-only (no Link): leave strong links so the endpoint becomes Ghost.
    if (!draft.deleteLink) {
      return this.finishDeletionBasketAdd(draft, {
        candidateDataIds: this.mergeUniqueIds(draft.candidateDataIds, [dataId]),
        candidateLinkIds: draft.candidateLinkIds,
        candidateGeometryIds: draft.candidateGeometryIds,
      });
    }

    const incident = nonErasableLinksForData(this.linkMap.values(), dataId);
    // Orphan data (created without links yet): add endpoint only.
    if (incident.length === 0) {
      return this.finishDeletionBasketAdd(draft, {
        candidateDataIds: this.mergeUniqueIds(draft.candidateDataIds, [dataId]),
        candidateLinkIds: draft.candidateLinkIds,
        candidateGeometryIds: draft.candidateGeometryIds,
      });
    }

    if (incident.length > 1) {
      return this.beginDeletionPendingResolution(
        draft,
        'data',
        dataId,
        incident,
        'pickCounterparts',
      );
    }

    const link = incident[0]!;
    return this.finishDeletionBasketAdd(
      draft,
      expandBasketForEndpointOneToOne(
        draft,
        'data',
        dataId,
        link,
        this.linkMap.values(),
      ),
    );
  }

  /**
   * Link-only: identify a link by selecting a geometry or data endpoint.
   * 0 → message; 1 → add link; N → link resolution modal.
   */
  addLinkOnlyFromEndpoint(
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ): DeletionBasketAddResult {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return { ok: false, message: 'Deletion selection is not active.' };
    }
    if (draft.pendingResolution) {
      return { ok: false, message: 'Finish or cancel the current multi-link selection first.' };
    }
    if (!draft.deleteLink || draft.deleteGeometry || draft.deleteData) {
      return this.failDeletionBasketAdd(
        draft,
        'Link-only selection requires Link without Geometry or Data.',
      );
    }

    const incident = endpointKind === 'geometry'
      ? nonErasableLinksForGeometry(this.linkMap.values(), endpointId)
      : nonErasableLinksForData(this.linkMap.values(), endpointId);

    if (incident.length === 0) {
      return this.failDeletionBasketAdd(draft, DELETION_NO_LINKS_MESSAGE);
    }

    const cardinality = needsCardinalityResolution(draft, incident);
    if (cardinality) {
      return this.beginDeletionPendingResolution(
        draft,
        endpointKind,
        endpointId,
        incident,
        cardinality,
      );
    }

    const link = incident[0]!;
    return this.finishDeletionBasketAdd(draft, {
      candidateLinkIds: this.mergeUniqueIds(draft.candidateLinkIds, [link.id]),
      candidateGeometryIds: [],
      candidateDataIds: [],
    });
  }

  /** Fan-out Yes / link-resolution All. */
  confirmDeletionPendingAll(): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution) {
      return;
    }
    const pending = draft.pendingResolution;
    const next = pending.modal === 'fanOut'
      ? expandBasketForFanOut(draft, pending, this.linkMap.values())
      : expandBasketForSelectedLinks(
        draft,
        pending,
        pending.incidentLinkIds,
        this.linkMap.values(),
      );
    this.finishDeletionBasketAdd(draft, next);
  }

  /** Fan-out Cancel / link-resolution None — discard pending only. */
  cancelDeletionPendingResolution(): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution) {
      return;
    }
    this.deletionDraft = {
      ...draft,
      pendingResolution: null,
      selectionMessage: null,
    };
    this.bump();
  }

  /** Switch link-resolution to counterpart pick (checklist or viewer). */
  beginDeletionCounterpartPick(): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution || draft.pendingResolution.modal !== 'linkResolution') {
      return;
    }
    this.deletionDraft = {
      ...draft,
      pendingResolution: {
        ...draft.pendingResolution,
        modal: 'pickCounterparts',
        selectedCounterpartIds: [],
      },
    };
    this.bump();
  }

  setDeletionCounterpartSelection(counterpartIds: string[]): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution || draft.pendingResolution.modal !== 'pickCounterparts') {
      return;
    }
    this.deletionDraft = {
      ...draft,
      pendingResolution: {
        ...draft.pendingResolution,
        selectedCounterpartIds: [...new Set(counterpartIds)],
      },
    };
    this.bump();
  }

  toggleDeletionCounterpartSelection(counterpartId: string): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution || draft.pendingResolution.modal !== 'pickCounterparts') {
      return;
    }
    const current = new Set(draft.pendingResolution.selectedCounterpartIds);
    if (current.has(counterpartId)) {
      current.delete(counterpartId);
    } else {
      current.add(counterpartId);
    }
    this.setDeletionCounterpartSelection([...current]);
  }

  /** Stage the chosen links and the endpoint that initiated deletion. */
  confirmDeletionCounterpartPick(): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft?.pendingResolution || draft.pendingResolution.modal !== 'pickCounterparts') {
      return;
    }
    const pending = draft.pendingResolution;
    if (pending.selectedCounterpartIds.length === 0) {
      return;
    }
    const linkIds = linkIdsForCounterparts(
      pending,
      pending.selectedCounterpartIds,
      this.linkMap.values(),
    );
    this.finishDeletionBasketAdd(draft, {
      candidateLinkIds: linkIds,
      candidateGeometryIds: pending.endpointKind === 'geometry' ? [pending.endpointId] : [],
      candidateDataIds: pending.endpointKind === 'data' ? [pending.endpointId] : [],
    });
  }

  /**
   * Record a selection-time lock rejection without changing the basket.
   */
  reportDeletionSelectionBlocked(message: string): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return;
    }
    this.deletionDraft = { ...draft, selectionMessage: message };
    this.bump();
  }

  removeFromDeletionBasket(args: {
    linkId?: string;
    geometryId?: string;
    dataId?: string;
  }): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return;
    }

    this.deletionDraft = {
      ...draft,
      candidateLinkIds: args.linkId
        ? draft.candidateLinkIds.filter((id) => id !== args.linkId)
        : draft.candidateLinkIds,
      candidateGeometryIds: args.geometryId
        ? draft.candidateGeometryIds.filter((id) => id !== args.geometryId)
        : draft.candidateGeometryIds,
      candidateDataIds: args.dataId
        ? draft.candidateDataIds.filter((id) => id !== args.dataId)
        : draft.candidateDataIds,
      ...(draft.targetKind === 'geometry' && draft.targetId === args.geometryId ? { targetKind: null, targetId: null } : {}),
      ...(draft.targetKind === 'data' && draft.targetId === args.dataId ? { targetKind: null, targetId: null } : {}),
      selectionMessage: null,
    };
    this.bump();
  }

  deselectGeometryFromDeletionBasket(geometryId: string): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return;
    }
    this.deletionDraft = {
      ...draft,
      ...computeGeometryDeselection(draft, geometryId, this.linkMap.values()),
      ...(draft.targetKind === 'geometry' && draft.targetId === geometryId ? { targetKind: null, targetId: null } : {}),
      selectionMessage: null,
    };
    this.bump();
  }

  deselectDataFromDeletionBasket(dataId: string): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return;
    }
    this.deletionDraft = {
      ...draft,
      ...computeDataDeselection(draft, dataId, this.linkMap.values()),
      ...(draft.targetKind === 'data' && draft.targetId === dataId ? { targetKind: null, targetId: null } : {}),
      selectionMessage: null,
    };
    this.bump();
  }

  /** Clear all deletion basket candidates (e.g. viewer background click). */
  clearDeletionBasket(): void {
    const draft = this.ensureDeletionSelecting();
    if (!draft) {
      return;
    }
    if (
      draft.candidateLinkIds.length === 0
      && draft.candidateGeometryIds.length === 0
      && draft.candidateDataIds.length === 0
      && draft.targetId === null
      && draft.selectionMessage === null
      && draft.pendingResolution === null
    ) {
      return;
    }
    this.deletionDraft = {
      ...draft,
      candidateLinkIds: [],
      candidateGeometryIds: [],
      candidateDataIds: [],
      targetKind: null,
      targetId: null,
      restoreGeometryIds: [],
      restoreDataIds: [],
      selectionMessage: null,
      pendingResolution: null,
    };
    this.bump();
  }

  /**
   * Confirm delete: prune remote editor locks, then mark erasable links → geometries → data.
   */
  async commitDeletionDraft(
    lockContext: Pick<DeletionLockPruneContext, 'activeSocialLocks' | 'currentStreamId'>,
  ): Promise<AnnotationStoreActionResult> {
    if (!this.deletionDraft || this.deletionDraft.step !== 'selecting') {
      return { ok: false, message: 'Deletion is not ready to commit.' };
    }
    if (this.isDeleting) {
      return { ok: false, message: 'Deletion is already in progress.' };
    }
    if (this.isCreating || this.isCreationWizardActive) {
      return { ok: false, message: 'Finish or cancel creation before deleting.' };
    }

    const geometryIdsByDataId = this.buildGeometryIdsByDataId();
    const pruned = pruneLockedFromDeletionBasket(this.deletionDraft, {
      activeSocialLocks: lockContext.activeSocialLocks,
      currentStreamId: lockContext.currentStreamId,
      links: this.linkMap.values(),
      geometryIdsByDataId,
    });

    const restoreBlocked = [
      ...this.deletionDraft.restoreGeometryIds.map((id) => ({ entityKind: 'geometry' as const, entityId: id })),
      ...this.deletionDraft.restoreDataIds.map((id) => ({ entityKind: 'data' as const, entityId: id })),
    ].some((item) => isEntityBlockedForDeletion({
      ...item,
      activeSocialLocks: lockContext.activeSocialLocks,
      currentStreamId: lockContext.currentStreamId,
      links: this.linkMap.values(),
      geometryIdsByDataId,
    }));
    if (pruned.skipMessage || restoreBlocked) {
      return { ok: false, message: 'An item is being edited by another user. Review the deletion before retrying.' };
    }

    if (!canConfirmDeletionBasket(pruned.draft, { links: this.linkMap.values() })) {
      this.deletionDraft = {
        ...pruned.draft,
        selectionMessage: pruned.skipMessage
          ?? 'Nothing left to delete after removing items edited by another user.',
      };
      this.bump();
      return {
        ok: false,
        message: this.deletionDraft.selectionMessage ?? 'Deletion basket is empty.',
      };
    }

    const planResult = buildDeletionCommitPlan(pruned.draft, {
      getLink: (id) => this.linkMap.get(id),
      getGeometry: (id) => this.geometryMap.get(id),
      getData: (id) => this.dataMap.get(id),
      links: this.linkMap.values(),
    });
    if (!planResult.ok) {
      this.deletionDraft = {
        ...pruned.draft,
        selectionMessage: planResult.message,
      };
      this.bump();
      return { ok: false, message: planResult.message };
    }

    const draftSnapshot: AnnotationDeletionDraft = {
      ...pruned.draft,
      selectionMessage: pruned.skipMessage,
    };
    const myGen = this.generation;
    this.isDeleting = true;
    this.deletionDraft = { ...draftSnapshot, step: 'committing' };
    this.bump();

    const marked: Array<{
      kind: 'link' | 'geometry' | 'data';
      id: string;
      version: number;
      action?: 'restore';
      previousErasableBy: string | null;
    }> = [];

    try {
      for (const item of planResult.plan.items) {
        if (this.generation !== myGen) {
          await this.revertDeletionCommitArtifacts(marked);
          this.restoreDeletionDraftAfterInterruptedCommit(draftSnapshot, myGen);
          return { ok: false, message: 'Deletion was interrupted by a scene reload.' };
        }

        try {
          const previousErasableBy = this.getEntity(item.kind, item.id)?.erasableBy ?? null;
          const nextVersion = await this.applyDeletionPlanItem(item);
          marked.push({ kind: item.kind, id: item.id, version: nextVersion, action: item.action, previousErasableBy });
        } catch (err) {
          if (
            err instanceof AnnotationApiError
            && (
              err.code === 'annotation.link.already_erasable'
              || err.code === 'annotation.geometry.already_erasable'
              || err.code === 'annotation.data.already_erasable'
            )
          ) {
            // Treat as done for this id; keep going.
            continue;
          }
          throw err;
        }
      }

      if (this.generation !== myGen) {
        await this.revertDeletionCommitArtifacts(marked);
        this.restoreDeletionDraftAfterInterruptedCommit(draftSnapshot, myGen);
        return { ok: false, message: 'Deletion was interrupted by a scene reload.' };
      }

      // Linked erasable endpoints stay visible as ghosts; unlinked ones disappear.
      this.recomputeActiveSelection();
      this.deletionDraft = null;
      this.bump();
      return {
        ok: true,
        message: pruned.skipMessage ?? undefined,
      };
    } catch (err) {
      const hadPersisted = marked.length > 0;
      await this.revertDeletionCommitArtifacts(marked);
      if (this.generation === myGen) {
        this.deletionDraft = {
          ...draftSnapshot,
          step: 'selecting',
          selectionMessage: null,
        };
        this.bump();
      }
      const rollbackSuffix = hadPersisted
        ? ' Changes from this delete were rolled back.'
        : '';
      return {
        ok: false,
        message: `${formatDeletionCommitError(err)}${rollbackSuffix}`,
      };
    } finally {
      if (this.generation === myGen) {
        this.isDeleting = false;
        if (this.deletionDraft?.step === 'committing') {
          this.deletionDraft = { ...this.deletionDraft, step: 'selecting' };
        }
        this.bump();
      }
    }
  }

  async advanceCreationStep(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!this.creationDraft) {
      return { ok: false, message: 'No creation session is active.' };
    }

    if (this.creationDraft.step === 'geometry' && this.creationDraft.geometryMode === 'new') {
      flushCreationDraftGeometry();
    }

    const stepValidation = validateCreationStep(this.creationDraft);
    if (!stepValidation.ok) {
      return { ok: false, message: stepValidation.message ?? 'Step is not complete.' };
    }

    if (this.creationDraft.step === 'geometry') {
      this.creationDraft = { ...this.creationDraft, step: 'data' };
      this.bump();
      return { ok: true };
    }

    if (this.creationDraft.step === 'data') {
      return this.commitCreationDraft();
    }

    return { ok: false, message: 'Creation cannot advance from the current step.' };
  }

  setCreationDraftShapes(shapes: AnnotationShape[]): void {
    if (
      !this.creationDraft
      || this.creationDraft.geometryMode !== 'new'
      || (this.creationDraft.step !== 'geometry'
        && this.creationDraft.step !== 'data'
        && this.creationDraft.step !== 'committing')
    ) {
      return;
    }
    const last = lastCreatedGeometry(this.creationDraft);
    if (!last) {
      return;
    }
    const createdGeometries = this.creationDraft.createdGeometries.map((entry, index, all) => (
      index === all.length - 1 ? { ...entry, shapes } : entry
    ));
    this.creationDraft = { ...this.creationDraft, createdGeometries };
    this.bump();
  }

  setCreationDraftGeometry(viewerId: string, shapes: AnnotationShape[]): void {
    if (
      !this.creationDraft
      || this.creationDraft.step !== 'geometry'
      || this.creationDraft.geometryMode !== 'new'
    ) {
      return;
    }
    const list = [...this.creationDraft.createdGeometries];
    const last = list[list.length - 1];
    if (last && last.viewerId === viewerId) {
      list[list.length - 1] = { viewerId, shapes };
    } else {
      list.push({ viewerId, shapes });
    }
    this.creationDraft = {
      ...this.creationDraft,
      createdGeometries: list,
      selectedGeometryIds: [],
    };
    this.bump();
  }

  undoLastCreatedGeometry(): string | null {
    if (!this.creationDraft || this.creationDraft.geometryMode !== 'new') {
      return null;
    }
    if (this.creationDraft.createdGeometries.length === 0) {
      return null;
    }
    const removed = this.creationDraft.createdGeometries[this.creationDraft.createdGeometries.length - 1]!;
    this.creationDraft = {
      ...this.creationDraft,
      createdGeometries: this.creationDraft.createdGeometries.slice(0, -1),
    };
    this.bump();
    return removed.viewerId;
  }

  /**
   * Push the pending data form into createdData (batch New).
   * Clears pending fields on success.
   */
  confirmPendingCreatedData(): { ok: true } | { ok: false; message: string } {
    if (!this.creationDraft || this.creationDraft.step !== 'data') {
      return { ok: false, message: 'Data step is not active.' };
    }
    if (this.creationDraft.dataMode !== 'new') {
      return { ok: false, message: 'Data create mode is not active.' };
    }
    if (!canAddMoreData(this.creationDraft)) {
      return {
        ok: false,
        message: 'Only one data record is allowed when multiple geometries are present.',
      };
    }
    const pending = pendingDataAsCreated(this.creationDraft);
    if (!pending) {
      return { ok: false, message: 'Enter a label before saving data.' };
    }

    this.creationDraft = {
      ...this.creationDraft,
      createdData: [...this.creationDraft.createdData, pending],
      selectedDataIds: [],
      ...emptyPendingData(),
    };
    this.bump();
    return { ok: true };
  }

  undoLastCreatedData(): boolean {
    if (!this.creationDraft || this.creationDraft.dataMode !== 'new') {
      return false;
    }
    if (this.creationDraft.createdData.length === 0) {
      return false;
    }
    this.creationDraft = {
      ...this.creationDraft,
      createdData: this.creationDraft.createdData.slice(0, -1),
    };
    this.bump();
    return true;
  }

  toggleCreationGeometrySelection(geometryId: string): void {
    if (
      !this.creationDraft
      || this.creationDraft.step !== 'geometry'
      || this.creationDraft.geometryMode !== 'choose'
    ) {
      return;
    }

    const geometry = this.geometryMap.get(geometryId);
    if (
      !geometry
      || geometry.erasableAt !== null
      || geometry.referenceType !== this.creationDraft.geometryScope.referenceType
      || geometry.referenceId !== this.creationDraft.geometryScope.referenceId
    ) {
      return;
    }

    const current = this.creationDraft.selectedGeometryIds;
    const allowsMultiple = allowsMultipleGeometrySelection(this.creationDraft);
    let next: string[];

    if (current.includes(geometryId)) {
      next = current.filter((id) => id !== geometryId);
    } else if (allowsMultiple) {
      next = [...current, geometryId];
    } else {
      next = [geometryId];
    }

    this.creationDraft = {
      ...this.creationDraft,
      selectedGeometryIds: next,
      createdGeometries: [],
    };
    this.bump();
  }

  setCreationGeometrySelection(geometryIds: string[]): void {
    if (
      !this.creationDraft
      || this.creationDraft.step !== 'geometry'
      || this.creationDraft.geometryMode !== 'choose'
    ) {
      return;
    }

    const searchableIds = new Set(
      filterGeometriesForCreationSearch(
        [...this.geometryMap.values()],
        this.creationDraft,
      ).map((geometry) => geometry.id),
    );

    const filtered = geometryIds.filter((id) => searchableIds.has(id));
    const allowsMultiple = allowsMultipleGeometrySelection(this.creationDraft);
    const next = allowsMultiple
      ? filtered
      : (filtered.length > 0 ? [filtered[filtered.length - 1]] : []);

    this.creationDraft = {
      ...this.creationDraft,
      selectedGeometryIds: next,
      createdGeometries: [],
    };
    this.bump();
  }

  toggleCreationDataSelection(dataId: string): void {
    if (
      !this.creationDraft
      || this.creationDraft.step !== 'data'
      || this.creationDraft.dataMode !== 'choose'
    ) {
      return;
    }

    const datum = this.dataMap.get(dataId);
    if (
      !datum
      || datum.erasableAt !== null
      || datum.visibilityType !== this.creationDraft.dataVisibility.visibilityType
      || datum.visibilityId !== this.creationDraft.dataVisibility.visibilityId
    ) {
      return;
    }

    const current = this.creationDraft.selectedDataIds;
    const allowsMultiple = allowsMultipleDataSelection(this.creationDraft);
    let next: string[];

    if (current.includes(dataId)) {
      next = current.filter((id) => id !== dataId);
    } else if (allowsMultiple) {
      next = [...current, dataId];
    } else {
      next = [dataId];
    }

    this.creationDraft = {
      ...this.creationDraft,
      selectedDataIds: next,
      createdData: [],
    };
    this.bump();
  }

  async commitCreationDraft(): Promise<AnnotationStoreActionResult> {
    if (!this.creationDraft) {
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
      const geometriesToCreate = resolveCreatedGeometriesForCommit(draftSnapshot);

      for (const entry of geometriesToCreate) {
        const geometry = await this.client.createGeometry({
          shapes: entry.shapes,
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
      }

      if (draftSnapshot.geometryMode === 'choose') {
        geometryIds = [...draftSnapshot.selectedGeometryIds];
      }

      let dataIds: string[] = [];
      const dataToCreate = resolveCreatedDataForCommit(draftSnapshot);

      for (const entry of dataToCreate) {
        const counter = await this.client.consumeProjectCounter();
        const defaultLabel = formatDefaultDataLabel(counter);
        const requestedLabel = entry.label.trim();
        const datum = await this.client.createData({
          label: requestedLabel.length > 0 ? requestedLabel : defaultLabel,
          description: entry.description,
          class: entry.class,
          content: entry.content,
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
      }

      if (draftSnapshot.dataMode === 'choose') {
        dataIds = [...draftSnapshot.selectedDataIds];
      }

      if (geometryIds.length > 0 && dataIds.length > 0) {
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

      this.rememberedCreationSetup = extractCreationSetup(draftSnapshot);
      this.creationDraft = null;
      this.bump();
      return { ok: true };
    } catch (err) {
      const hadPersistedArtifacts =
        created.geometries.length > 0
        || created.data.length > 0
        || created.links.length > 0;
      const rollbackMessage = hadPersistedArtifacts
        ? ' Partially saved items were marked erasable and removed from this session.'
        : '';

      if (this.generation === myGen) {
        await this.revertWizardCommitArtifacts(created);
        this.creationDraft = { ...draftSnapshot, step: draftSnapshot.step };
        this.callbacks.onError(err);
        this.bump();
        return {
          ok: false,
          message: `${formatCreationCommitError(err)}${rollbackMessage}`,
        };
      }

      await this.revertWizardCommitArtifacts(created);
      this.restoreCreationDraftAfterInterruptedCommit(draftSnapshot, myGen);
      return {
        ok: false,
        message: 'Creation was interrupted by a scene reload.',
      };
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
    const hadPending = this.isSaving.size > 0 || this.isCreating || this.isDeleting;
    this.generation += 1;
    this.isSaving.clear();
    this.isCreating = false;
    this.isDeleting = false;
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
    this.selectionCriteria = { showErased: false };
    this.activeSelection = createEmptyActiveSelection();
    this.creationDraft = null;
    this.deletionDraft = null;
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
    const hadPending = this.isSaving.size > 0 || this.isCreating || this.isDeleting;
    this.generation += 1;
    const myGen = this.generation;
    this.isSaving.clear();
    this.isCreating = false;
    this.isDeleting = false;
    this.creationDraft = null;
    this.deletionDraft = null;
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

  private restoreDeletionDraftAfterInterruptedCommit(
    draftSnapshot: AnnotationDeletionDraft,
    myGen: number,
  ): void {
    if (this.generation !== myGen) {
      this.deletionDraft = null;
      this.isDeleting = false;
      this.bump();
      return;
    }

    this.deletionDraft = { ...draftSnapshot, step: 'selecting' };
    this.isDeleting = false;
    this.bump();
  }

  private buildGeometryIdsByDataId(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const link of this.linkMap.values()) {
      const list = map.get(link.dataId) ?? [];
      list.push(link.geometryId);
      map.set(link.dataId, list);
    }
    return map;
  }

  private async applyDeletionPlanItem(item: {
    kind: 'link' | 'geometry' | 'data';
    id: string;
    expectedVersion: number;
    action?: 'restore';
  }): Promise<number> {
    const erase = item.action !== 'restore';
    const result = await this.patchErasable(item.kind, item.id, item.expectedVersion, erase);
    const entity = this.getEntity(item.kind, item.id);
    if (entity) {
      this.setEntity(item.kind, item.id, {
        ...entity,
        version: result.version,
        erasableAt: erase ? result.updatedAt ?? new Date().toISOString() : null,
        erasableBy: erase ? entity.erasableBy : null,
      });
    }
    return result.version;
  }

  private async revertDeletionCommitArtifacts(
    marked: Array<{ kind: 'link' | 'geometry' | 'data'; id: string; version: number; action?: 'restore'; previousErasableBy: string | null }>,
  ): Promise<void> {
    try {
      // Compensate each transition in reverse order.
      for (const item of [...marked].reverse()) {
        try {
          const reverted = await this.patchErasable(item.kind, item.id, item.version, item.action === 'restore');
          const entity = this.getEntity(item.kind, item.id);
          if (entity) {
            this.setEntity(item.kind, item.id, {
              ...entity,
              version: reverted.version,
              erasableAt: item.action === 'restore' ? reverted.updatedAt ?? new Date().toISOString() : null,
              erasableBy: item.action === 'restore' ? item.previousErasableBy : null,
            });
          }
        } catch (compensateErr) {
          console.error('[AnnotationStore] deletion commit rollback item failed', item, compensateErr);
        }
      }
      this.recomputeActiveSelection();
      this.bump();
    } catch (compensateErr) {
      console.error('[AnnotationStore] deletion commit rollback failed', compensateErr);
    }
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
