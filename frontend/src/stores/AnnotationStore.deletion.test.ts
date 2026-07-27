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
  markGeometryErasable: vi.fn(),
  markDataErasable: vi.fn(),
  markLinkErasable: vi.fn(),
  markGeometryNonErasable: vi.fn(),
  markDataNonErasable: vi.fn(),
  markLinkNonErasable: vi.fn(),
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

function makeDatum(id: string): AnnotationData {
  return {
    id,
    projectId: 'project-1',
    label: id,
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

async function seedScene(
  store: ReturnType<typeof createTestStore>,
  bundle: {
    geometries?: AnnotationGeometry[];
    data?: AnnotationData[];
    links?: AnnotationLink[];
  } = {},
) {
  mockClient.loadSceneBundle.mockResolvedValue({
    geometries: bundle.geometries ?? [],
    data: bundle.data ?? [],
    links: bundle.links ?? [],
  });
  await store.init(false);
}

const emptyLocks = { activeSocialLocks: [], currentStreamId: null };

describe('AnnotationStore deletion wizard commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.markGeometryErasable.mockResolvedValue({
      success: true,
      version: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    mockClient.markDataErasable.mockResolvedValue({
      success: true,
      version: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    mockClient.markLinkErasable.mockResolvedValue({
      success: true,
      version: 1,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    mockClient.markGeometryNonErasable.mockResolvedValue({
      success: true,
      version: 2,
      updatedAt: null,
    });
    mockClient.markDataNonErasable.mockResolvedValue({
      success: true,
      version: 2,
      updatedAt: null,
    });
    mockClient.markLinkNonErasable.mockResolvedValue({
      success: true,
      version: 2,
      updatedAt: null,
    });
  });

  it('commits link-only basket without marking endpoints', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: false, deleteData: false });
    store.addLinkOnlyFromEndpoint('geometry', 'g1');

    const result = await store.commitDeletionDraft(emptyLocks);

    expect(result).toEqual({ ok: true });
    expect(mockClient.markLinkErasable).toHaveBeenCalledWith('l1', 0);
    expect(mockClient.markGeometryErasable).not.toHaveBeenCalled();
    expect(mockClient.markDataErasable).not.toHaveBeenCalled();
    expect(store.deletionDraftState).toBeNull();
    expect(store.geometriesById.get('g1')?.erasableAt).toBeNull();
    expect(store.linksById.get('l1')?.erasableAt).not.toBeNull();
  });

  it('commits geometry + link in link-then-geometry order', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: true, deleteData: false });
    store.addGeometryToDeletionBasket('g1');

    const result = await store.commitDeletionDraft(emptyLocks);

    expect(result).toEqual({ ok: true });
    expect(mockClient.markLinkErasable).toHaveBeenCalledBefore(
      mockClient.markGeometryErasable as ReturnType<typeof vi.fn>,
    );
    expect(mockClient.markLinkErasable).toHaveBeenCalledWith('l1', 0);
    expect(mockClient.markGeometryErasable).toHaveBeenCalledWith('g1', 0);
    expect(mockClient.markDataErasable).not.toHaveBeenCalled();
  });

  it('commits data + link in link-then-data order', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: false, deleteData: true });
    store.addDataToDeletionBasket('d1');

    const result = await store.commitDeletionDraft(emptyLocks);

    expect(result).toEqual({ ok: true });
    expect(mockClient.markLinkErasable).toHaveBeenCalledBefore(
      mockClient.markDataErasable as ReturnType<typeof vi.fn>,
    );
    expect(mockClient.markDataErasable).toHaveBeenCalledWith('d1', 0);
    expect(mockClient.markGeometryErasable).not.toHaveBeenCalled();
  });

  it('commits full triplet in link → geometry → data order', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: true, deleteData: true });
    store.addGeometryToDeletionBasket('g1');

    const result = await store.commitDeletionDraft(emptyLocks);

    expect(result).toEqual({ ok: true });
    const order = [
      mockClient.markLinkErasable.mock.invocationCallOrder[0],
      mockClient.markGeometryErasable.mock.invocationCallOrder[0],
      mockClient.markDataErasable.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it('rolls back partial commits and preserves the deletion draft', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    mockClient.markGeometryErasable.mockRejectedValue(
      new AnnotationApiError('still linked', 409, 'annotation.geometry.still_linked'),
    );

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: true, deleteData: false });
    store.addGeometryToDeletionBasket('g1');

    const result = await store.commitDeletionDraft(emptyLocks);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/still linked outside/i);
      expect(result.message).toMatch(/rolled back/i);
    }
    expect(mockClient.markLinkNonErasable).toHaveBeenCalledWith('l1', 1);
    expect(store.deletionDraftState?.step).toBe('selecting');
    expect(store.deletionDraftState?.candidateGeometryIds).toEqual(['g1']);
    expect(store.linksById.get('l1')?.erasableAt).toBeNull();
  });

  it('aborts commit when the scene reload interrupts the wizard', async () => {
    const store = createTestStore();
    await seedScene(store, {
      geometries: [makeGeometry('g1')],
      data: [makeDatum('d1')],
      links: [makeLink('l1', 'g1', 'd1')],
    });

    let resolveLink!: (value: { success: boolean; version: number; updatedAt: string }) => void;
    mockClient.markLinkErasable.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLink = resolve;
        }),
    );

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: true, deleteData: true });
    store.addGeometryToDeletionBasket('g1');

    const commitPromise = store.commitDeletionDraft(emptyLocks);
    await store.loadScene('scene-2');
    resolveLink({ success: true, version: 1, updatedAt: '2026-01-02T00:00:00.000Z' });

    const result = await commitPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('interrupted');
    }
    expect(mockClient.markLinkNonErasable).toHaveBeenCalledWith('l1', 1);
  });
});

describe('AnnotationStore creation/delete wizard exclusivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.loadSceneBundle.mockResolvedValue({
      geometries: [],
      data: [],
      links: [],
    });
  });

  it('blocks creation while deletion is active', async () => {
    const store = createTestStore();
    await seedScene(store);

    store.initDeletionDraft();
    store.beginDeletionWizard({ deleteLink: true, deleteGeometry: false, deleteData: false });

    store.initCreationDraft();
    const result = store.beginCreationWizard();

    expect(result).toEqual({
      ok: false,
      message: 'Finish or cancel deletion before creating.',
    });
    expect(store.creationDraftState).toBeNull();
  });

  it('blocks deletion while creation is active', async () => {
    const store = createTestStore();
    await seedScene(store);

    store.initCreationDraft();
    store.beginCreationWizard();

    store.initDeletionDraft();
    expect(store.deletionDraftState).toBeNull();

    const result = store.beginDeletionWizard({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
    });
    expect(result).toEqual({
      ok: false,
      message: 'Finish or cancel creation before deleting.',
    });
  });
});
