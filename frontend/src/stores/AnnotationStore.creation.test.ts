import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  AnnotationShape,
} from 'shared/annotation-types';

const testShapes: AnnotationShape[] = [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }];

const mockClient = vi.hoisted(() => ({
  loadSceneBundle: vi.fn(),
  connectRealtime: vi.fn(),
  disconnectRealtime: vi.fn(),
  createGeometry: vi.fn(),
  createData: vi.fn(),
  createLink: vi.fn(),
  consumeProjectCounter: vi.fn(),
  markGeometryErasable: vi.fn(),
  markDataErasable: vi.fn(),
  markLinkErasable: vi.fn(),
}));

vi.mock('../services/AnnotationApiClient', () => ({
  AnnotationApiClient: vi.fn(function MockAnnotationApiClient() {
    return mockClient;
  }),
  AnnotationApiError: class AnnotationApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'AnnotationApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

import { AnnotationApiError } from '../services/AnnotationApiClient';
import { createAnnotationStore } from './AnnotationStore';

function makeGeometry(id: string): AnnotationGeometry {
  return {
    id,
    projectId: 'project-1',
    shapes: testShapes,
    referenceType: 'scene',
    referenceId: 'scene-1',
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'user-1',
    erasableAt: null,
    erasableBy: null,
  };
}

function makeDatum(id: string, label = 'Draft label'): AnnotationData {
  return {
    id,
    projectId: 'project-1',
    label,
    description: '',
    class: null,
    content: {},
    visibilityType: 'scene',
    visibilityId: 'scene-1',
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'user-1',
    erasableAt: null,
    erasableBy: null,
  };
}

function makeLink(id: string, geometryId: string, dataId: string): AnnotationLink {
  return {
    id,
    projectId: 'project-1',
    geometryId,
    dataId,
    version: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'user-1',
    erasableAt: null,
    erasableBy: null,
  };
}

function createTestStore() {
  return createAnnotationStore('project-1', 'scene-1', {
    onUpdate: vi.fn(),
    onRealtimeStateChange: vi.fn(),
    onConflict: vi.fn(),
    onError: vi.fn(),
    onEditsCancelled: vi.fn(),
  });
}

describe('AnnotationStore creation wizard commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.loadSceneBundle.mockResolvedValue({
      geometries: [],
      data: [],
      links: [],
    });
    mockClient.consumeProjectCounter.mockResolvedValue(1n);
    mockClient.markGeometryErasable.mockResolvedValue({ success: true, version: 1, updatedAt: null });
    mockClient.markDataErasable.mockResolvedValue({ success: true, version: 1, updatedAt: null });
    mockClient.markLinkErasable.mockResolvedValue({ success: true, version: 1, updatedAt: null });
  });

  it('appends sticky new geometries and undoes the last one', () => {
    const store = createTestStore();
    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });

    store.setCreationDraftGeometry('viewer-1', testShapes);
    store.setCreationDraftGeometry('viewer-2', [
      { type: 'ShapePoints', vertices: [[1, 1, 0]] },
    ]);

    expect(store.creationDraftState?.createdGeometries).toHaveLength(2);
    expect(store.creationDraftState?.createdGeometries.map((entry) => entry.viewerId)).toEqual([
      'viewer-1',
      'viewer-2',
    ]);

    const removedId = store.undoLastCreatedGeometry();
    expect(removedId).toBe('viewer-2');
    expect(store.creationDraftState?.createdGeometries).toEqual([
      { viewerId: 'viewer-1', shapes: testShapes },
    ]);

    store.setCreationDraftShapes([{ type: 'ShapePoints', vertices: [[9, 9, 0]] }]);
    expect(store.creationDraftState?.createdGeometries[0]?.shapes).toEqual([
      { type: 'ShapePoints', vertices: [[9, 9, 0]] },
    ]);
  });

  it('commits multiple created geometries with one data record', async () => {
    const store = createTestStore();
    mockClient.createGeometry
      .mockResolvedValueOnce(makeGeometry('g-a'))
      .mockResolvedValueOnce(makeGeometry('g-b'));
    mockClient.createData.mockResolvedValue(makeDatum('d-shared'));
    mockClient.createLink
      .mockResolvedValueOnce(makeLink('l-a', 'g-a', 'd-shared'))
      .mockResolvedValueOnce(makeLink('l-b', 'g-b', 'd-shared'));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });
    store.setCreationDraftGeometry('viewer-1', testShapes);
    store.setCreationDraftGeometry('viewer-2', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ dataMode: 'new', pendingDataLabel: 'Shared note' });

    const result = await store.commitCreationDraft();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).toHaveBeenCalledTimes(2);
    expect(mockClient.createData).toHaveBeenCalledTimes(1);
    expect(mockClient.createLink).toHaveBeenCalledTimes(2);
  });

  it('commits new geometry, data, and link sequentially', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-new'));
    mockClient.createData.mockResolvedValue(makeDatum('d-new'));
    mockClient.createLink.mockResolvedValue(makeLink('l-new', 'g-new', 'd-new'));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ dataMode: 'new', pendingDataLabel: 'Fragment A' });

    const result = await store.commitCreationDraft();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).toHaveBeenCalledTimes(1);
    expect(mockClient.createData).toHaveBeenCalledTimes(1);
    expect(mockClient.createLink).toHaveBeenCalledWith({ geometryId: 'g-new', dataId: 'd-new' });
    expect(store.creationDraftState).toBeNull();
    expect([...store.geometriesById.keys()]).toEqual(['g-new']);
    expect([...store.dataById.keys()]).toEqual(['d-new']);
    expect([...store.linksById.keys()]).toEqual(['l-new']);
  });

  it('commits geometry-only when data mode is unset', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-only'));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new', dataMode: null });
    store.setCreationDraftGeometry('viewer-1', testShapes);

    const geometryResult = await store.advanceCreationStep();
    expect(geometryResult).toEqual({ ok: true });
    const result = await store.advanceCreationStep();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).toHaveBeenCalledTimes(1);
    expect(mockClient.createData).not.toHaveBeenCalled();
    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it('commits data-only when geometry mode is unset', async () => {
    const store = createTestStore();
    mockClient.createData.mockResolvedValue(makeDatum('d-only'));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({
      geometryMode: null,
      dataMode: 'new',
      pendingDataLabel: 'Data only',
    });

    const result = await store.commitCreationDraft();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).not.toHaveBeenCalled();
    expect(mockClient.createData).toHaveBeenCalledTimes(1);
    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it('rejects existing-only no-op combinations without calling the API', async () => {
    const store = createTestStore();
    store.initCreationDraft();
    store.updateCreationDraft({
      step: 'data',
      geometryMode: null,
      dataMode: 'choose',
      selectedDataIds: ['d-existing'],
    });

    expect((await store.commitCreationDraft()).ok).toBe(false);

    store.updateCreationDraft({
      geometryMode: 'choose',
      dataMode: null,
      selectedGeometryIds: ['g-existing'],
      selectedDataIds: [],
    });

    expect((await store.commitCreationDraft()).ok).toBe(false);
    expect(mockClient.createGeometry).not.toHaveBeenCalled();
    expect(mockClient.createData).not.toHaveBeenCalled();
    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it('creates links for existing choose selections only', async () => {
    const store = createTestStore();
    mockClient.createLink
      .mockResolvedValueOnce(makeLink('l-1', 'g-1', 'd-1'))
      .mockResolvedValueOnce(makeLink('l-2', 'g-2', 'd-1'));

    store.initCreationDraft();
    store.updateCreationDraft({
      geometryMode: 'choose',
      dataMode: 'choose',
      step: 'data',
      selectedGeometryIds: ['g-1', 'g-2'],
      selectedDataIds: ['d-1'],
    });

    const result = await store.commitCreationDraft();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).not.toHaveBeenCalled();
    expect(mockClient.createData).not.toHaveBeenCalled();
    expect(mockClient.createLink).toHaveBeenCalledTimes(2);
  });

  it('rolls back partial commits and restores the draft on API failure', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-partial'));
    mockClient.createData.mockRejectedValue(new AnnotationApiError('Data failed', 500));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ dataMode: 'new', pendingDataLabel: 'Broken save' });

    const result = await store.commitCreationDraft();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Partially saved items were marked erasable');
    }
    expect(mockClient.markGeometryErasable).toHaveBeenCalledWith('g-partial', 0);
    expect(store.creationDraftState?.step).toBe('data');
    expect(store.creationDraftState?.pendingDataLabel).toBe('Broken save');
    expect(store.geometriesById.has('g-partial')).toBe(false);
  });

  it('aborts commit when the scene reload interrupts the wizard', async () => {
    const store = createTestStore();
    let resolveGeometry!: (value: AnnotationGeometry) => void;
    mockClient.createGeometry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeometry = resolve;
        }),
    );

    store.initCreationDraft();
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ dataMode: 'new', pendingDataLabel: 'Interrupted' });

    const commitPromise = store.commitCreationDraft();
    await store.loadScene('scene-2');
    resolveGeometry(makeGeometry('g-interrupted'));

    const result = await commitPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('interrupted');
    }
    expect(mockClient.markGeometryErasable).toHaveBeenCalledWith('g-interrupted', 0);
  });

  it('remembers scopes and drawing mode across discard and init', () => {
    const store = createTestStore();

    store.initCreationDraft();
    store.updateCreationDraft({
      drawingMode: 'point',
      geometryScope: { referenceType: 'asset', referenceId: 'asset-1' },
    });
    store.discardCreationDraft();
    store.initCreationDraft();

    expect(store.creationDraftState?.drawingMode).toBe('point');
    expect(store.creationDraftState?.geometryScope).toEqual({
      referenceType: 'asset',
      referenceId: 'asset-1',
    });
    expect(store.creationDraftState?.geometryMode).toBeNull();
  });

  it('remembers scopes after a successful commit', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-remember'));
    mockClient.createData.mockResolvedValue(makeDatum('d-remember'));
    mockClient.createLink.mockResolvedValue(makeLink('l-remember', 'g-remember', 'd-remember'));

    store.initCreationDraft();
    store.updateCreationDraft({
      dataVisibility: { visibilityType: 'asset', visibilityId: 'asset-2' },
    });
    store.beginCreationWizard();
    store.updateCreationDraft({ geometryMode: 'new' });
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({
      dataMode: 'new',
      pendingDataLabel: 'Remember me',
    });
    await store.commitCreationDraft();

    store.initCreationDraft();

    expect(store.creationDraftState?.dataVisibility).toEqual({
      visibilityType: 'asset',
      visibilityId: 'asset-2',
    });
    expect(store.creationDraftState?.geometryMode).toBeNull();
  });

  it('starts Link existing data at Data with the selected geometries', () => {
    const store = createTestStore();

    const result = store.beginLinkExistingDataForGeometries(['g-1', 'g-2', 'g-1']);

    expect(result).toEqual({ ok: true });
    expect(store.creationDraftState).toMatchObject({
      step: 'data',
      geometryMode: 'choose',
      dataMode: 'choose',
      selectedGeometryIds: ['g-1', 'g-2'],
      selectedDataIds: [],
    });
  });
});
