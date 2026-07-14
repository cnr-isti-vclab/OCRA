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
    updatedAt: null,
    updatedBy: null,
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
    updatedAt: null,
    updatedBy: null,
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
    updatedAt: null,
    updatedBy: null,
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

  it('commits new geometry, data, and link sequentially', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-new'));
    mockClient.createData.mockResolvedValue(makeDatum('d-new'));
    mockClient.createLink.mockResolvedValue(makeLink('l-new', 'g-new', 'd-new'));

    store.initCreationDraft();
    store.beginCreationWizard();
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ newDataLabel: 'Fragment A' });

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

  it('commits geometry-only when data choice is void', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-only'));

    store.initCreationDraft();
    store.updateCreationDraft({ dataChoice: 'void' });
    store.beginCreationWizard();
    store.setCreationDraftGeometry('viewer-1', testShapes);

    const result = await store.advanceCreationStep();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).toHaveBeenCalledTimes(1);
    expect(mockClient.createData).not.toHaveBeenCalled();
    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it('commits data-only when geometry choice is void', async () => {
    const store = createTestStore();
    mockClient.createData.mockResolvedValue(makeDatum('d-only'));

    store.initCreationDraft();
    store.updateCreationDraft({ geometryChoice: 'void' });
    store.beginCreationWizard();
    store.updateCreationDraft({ newDataLabel: 'Data only' });

    const result = await store.commitCreationDraft();

    expect(result).toEqual({ ok: true });
    expect(mockClient.createGeometry).not.toHaveBeenCalled();
    expect(mockClient.createData).toHaveBeenCalledTimes(1);
    expect(mockClient.createLink).not.toHaveBeenCalled();
  });

  it('creates links for existing search selections only', async () => {
    const store = createTestStore();
    mockClient.createLink
      .mockResolvedValueOnce(makeLink('l-1', 'g-1', 'd-1'))
      .mockResolvedValueOnce(makeLink('l-2', 'g-2', 'd-1'));

    store.initCreationDraft();
    store.updateCreationDraft({
      geometryChoice: 'search',
      dataChoice: 'search',
      multiSide: 'geometry',
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
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ newDataLabel: 'Broken save' });

    const result = await store.commitCreationDraft();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Partially saved items were marked erasable');
    }
    expect(mockClient.markGeometryErasable).toHaveBeenCalledWith('g-partial', 0);
    expect(store.creationDraftState?.step).toBe('data');
    expect(store.creationDraftState?.newDataLabel).toBe('Broken save');
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
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({ newDataLabel: 'Interrupted' });

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

  it('remembers setup choices across discard and init', () => {
    const store = createTestStore();

    store.initCreationDraft();
    store.updateCreationDraft({
      geometryChoice: 'search',
      dataChoice: 'void',
    });
    store.discardCreationDraft();
    store.initCreationDraft();

    expect(store.creationDraftState?.geometryChoice).toBe('search');
    expect(store.creationDraftState?.dataChoice).toBe('void');
  });

  it('remembers setup choices after a successful commit', async () => {
    const store = createTestStore();
    mockClient.createGeometry.mockResolvedValue(makeGeometry('g-remember'));
    mockClient.createData.mockResolvedValue(makeDatum('d-remember'));
    mockClient.createLink.mockResolvedValue(makeLink('l-remember', 'g-remember', 'd-remember'));

    store.initCreationDraft();
    store.updateCreationDraft({
      geometryChoice: 'new',
      dataChoice: 'search',
      multiSide: null,
    });
    store.beginCreationWizard();
    store.setCreationDraftGeometry('viewer-1', testShapes);
    await store.advanceCreationStep();
    store.updateCreationDraft({
      dataChoice: 'new',
      newDataLabel: 'Remember me',
    });
    await store.commitCreationDraft();

    store.initCreationDraft();

    expect(store.creationDraftState?.geometryChoice).toBe('new');
    expect(store.creationDraftState?.dataChoice).toBe('new');
  });
});
