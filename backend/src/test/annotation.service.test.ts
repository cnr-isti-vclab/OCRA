import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../lib/mongo/client.js', () => ({
  getMongoClient: vi.fn(),
}));

vi.mock('../repositories/annotation-data.repository.js', () => ({
  findAnnotationDataById: vi.fn(),
  findAnnotationDataByVisibility: vi.fn(),
  findAnnotationDataByVisibilityIds: vi.fn(),
  getAnnotationDataCollection: vi.fn(),
  insertAnnotationData: vi.fn(),
  conditionalUpdateAnnotationData: vi.fn(),
}));

vi.mock('../repositories/annotation-geometry.repository.js', () => ({
  findAnnotationGeometryById: vi.fn(),
  findAnnotationGeometriesByReference: vi.fn(),
  findAnnotationGeometriesByReferenceIds: vi.fn(),
  getAnnotationGeometryCollection: vi.fn(),
  insertAnnotationGeometry: vi.fn(),
  conditionalUpdateAnnotationGeometry: vi.fn(),
}));

vi.mock('../repositories/annotation-link.repository.js', () => ({
  findAnnotationLinkById: vi.fn(),
  findAnnotationLinkByPair: vi.fn(),
  findAnnotationLinksByDataId: vi.fn(),
  findAnnotationLinksByDataIds: vi.fn(),
  findAnnotationLinksByGeometryId: vi.fn(),
  findAnnotationLinksByGeometryIds: vi.fn(),
  getAnnotationLinkCollection: vi.fn(),
  insertAnnotationLink: vi.fn(),
  conditionalUpdateAnnotationLink: vi.fn(),
}));

vi.mock('../repositories/annotation.repository.ids.js', () => ({
  createAnnotationEntityId: vi.fn(() => 'al_generated'),
}));

vi.mock('../services/hdt-metadata.service.js', () => ({
  getHDTDocument: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { getMongoClient } from '../lib/mongo/client.js';
import { findAnnotationDataById } from '../repositories/annotation-data.repository.js';
import { getAnnotationDataCollection } from '../repositories/annotation-data.repository.js';
import { findAnnotationGeometryById } from '../repositories/annotation-geometry.repository.js';
import { getAnnotationGeometryCollection } from '../repositories/annotation-geometry.repository.js';
import {
  findAnnotationLinkById,
  findAnnotationLinksByDataId,
  findAnnotationLinksByGeometryId,
  findAnnotationLinkByPair,
  getAnnotationLinkCollection,
  insertAnnotationLink,
} from '../repositories/annotation-link.repository.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';
import {
  createAnnotationLink,
  getAnnotations,
  markAnnotationDataErasable,
  markAnnotationDataNonErasable,
  markAnnotationGeometryErasable,
  markAnnotationGeometryNonErasable,
  markAnnotationLinkNonErasable,
  resolveAnnotationImpactForLink,
} from '../services/annotation.service.js';

function createCursorMock<T>(items: T[]) {
  return {
    toArray: vi.fn().mockResolvedValue(items),
  };
}

function createSessionMock() {
  return {
    withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}

describe('annotation.service createAnnotationLink edge cases', () => {
  const prismaMock = {
    project: {
      findUnique: vi.fn(),
    },
  };

  const compatibleHdt = {
    scenes: [{ id: 'scene-1', assets: [{ assetId: 'asset-1' }] }],
    digitalAssets: [{ id: 'asset-1' }],
  };

  const geometry = {
    id: 'ag_1',
    projectId: 'project-1',
    shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
    referenceType: 'scene',
    referenceId: 'scene-1',
    version: 0,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-04-24T10:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-04-24T10:00:00.000Z',
    updatedBy: 'user-1',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1' });
    vi.mocked(getHDTDocument).mockResolvedValue(compatibleHdt as never);
  });

  it('returns null when the geometry/data pair already exists', async () => {
    vi.mocked(findAnnotationGeometryById).mockResolvedValue(geometry as never);
    vi.mocked(findAnnotationDataById).mockResolvedValue({
      ...geometry,
      id: 'ad_1',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'asset',
      visibilityId: 'asset-1',
    } as never);
    vi.mocked(findAnnotationLinkByPair).mockResolvedValue({ id: 'existing-link' } as never);

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_1', 'user-1')).resolves.toEqual({
      ok: false,
      code: 'duplicate_link_pair',
    });
    expect(insertAnnotationLink).not.toHaveBeenCalled();
  });

  it('returns null when geometry and data scopes are incompatible', async () => {
    vi.mocked(findAnnotationGeometryById).mockResolvedValue(geometry as never);
    vi.mocked(findAnnotationDataById).mockResolvedValue({
      ...geometry,
      id: 'ad_2',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'asset',
      visibilityId: 'asset-missing',
    } as never);
    vi.mocked(findAnnotationLinkByPair).mockResolvedValue(null as never);

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_2', 'user-1')).resolves.toEqual({
      ok: false,
      code: 'scope_incompatible',
    });
    expect(insertAnnotationLink).not.toHaveBeenCalled();
  });

  it('returns null when Mongo raises a duplicate-key conflict during insert', async () => {
    vi.mocked(findAnnotationGeometryById).mockResolvedValue(geometry as never);
    vi.mocked(findAnnotationDataById).mockResolvedValue({
      ...geometry,
      id: 'ad_3',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'asset',
      visibilityId: 'asset-1',
    } as never);
    vi.mocked(findAnnotationLinkByPair).mockResolvedValue(null as never);
    vi.mocked(insertAnnotationLink).mockRejectedValue({ code: 11000 });

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_3', 'user-1')).resolves.toEqual({
      ok: false,
      code: 'duplicate_link_pair',
    });
  });
});

describe('annotation.service scene lookups', () => {
  const prismaMock = {
    project: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1' });
  });

  it('returns scene_not_found when the requested scene is missing', async () => {
    vi.mocked(getHDTDocument).mockResolvedValue({
      scenes: [{ id: 'scene-1', assets: [] }],
      digitalAssets: [],
    } as never);

    await expect(getAnnotations('project-1', 'scene-missing')).resolves.toEqual({
      ok: false,
      code: 'scene_not_found',
    });
  });

  it('returns project-wide annotations when sceneId is omitted', async () => {
    const geometry = {
      id: 'ag_1',
      projectId: 'project-1',
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'scene',
      referenceId: 'scene-1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const datum = {
      id: 'ad_1',
      projectId: 'project-1',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const link = {
      id: 'al_1',
      projectId: 'project-1',
      geometryId: 'ag_1',
      dataId: 'ad_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };

    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue({
      find: vi.fn().mockReturnValue(createCursorMock([geometry])),
    } as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue({
      find: vi.fn().mockReturnValue(createCursorMock([datum])),
    } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({
      find: vi.fn().mockReturnValue(createCursorMock([link])),
    } as never);
    vi.mocked(findAnnotationLinksByGeometryId).mockResolvedValue([link] as never);
    vi.mocked(findAnnotationLinksByDataId).mockResolvedValue([link] as never);

    await expect(getAnnotations('project-1')).resolves.toEqual({
      ok: true,
      value: {
        geometries: [geometry],
        data: [datum],
        links: [link],
      },
    });
  });
});

describe('annotation.service impact resolution', () => {
  const prismaMock = {
    project: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1' });
  });

  it('returns mixed impact for links that connect different compatible scopes', async () => {
    vi.mocked(getHDTDocument).mockResolvedValue({
      scenes: [
        { id: 'scene-1', assets: [{ assetId: 'asset-1' }] },
        { id: 'scene-2', assets: [{ assetId: 'asset-1' }] },
      ],
      digitalAssets: [{ id: 'asset-1' }],
    } as never);
    vi.mocked(findAnnotationGeometryById).mockResolvedValue({
      id: 'ag_1',
      projectId: 'project-1',
      referenceType: 'scene',
      referenceId: 'scene-1',
    } as never);
    vi.mocked(findAnnotationDataById).mockResolvedValue({
      id: 'ad_1',
      projectId: 'project-1',
      visibilityType: 'asset',
      visibilityId: 'asset-1',
    } as never);

    await expect(resolveAnnotationImpactForLink('project-1', 'ag_1', 'ad_1')).resolves.toEqual({
      originScopeType: 'mixed',
      originScopeId: null,
      affectedSceneIds: ['scene-1', 'scene-2'],
      affectedAssetIds: ['asset-1'],
    });
  });
});

describe('annotation.service erasable cascades', () => {
  let session: ReturnType<typeof createSessionMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    session = createSessionMock();
    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
  });

  it('marks only annotation data erasable when annotation data becomes erasable', async () => {
    const existingData = {
      id: 'ad_1',
      projectId: 'project-1',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-1',
      version: 2,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const dataCollection = {
      findOne: vi.fn().mockResolvedValue(existingData),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          ...existingData,
          version: 3,
          erasableAt: '2026-04-25T10:00:00.000Z',
          erasableBy: 'user-2',
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getAnnotationDataCollection).mockResolvedValue(dataCollection as never);
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue({} as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({} as never);

    await expect(markAnnotationDataErasable('project-1', 'ad_1', 2, 'user-2')).resolves.toEqual({
      ok: true,
      value: 3,
    });
  });

  it('marks only annotation geometry erasable when annotation geometry becomes erasable', async () => {
    const existingGeometry = {
      id: 'ag_1',
      projectId: 'project-1',
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'scene',
      referenceId: 'scene-1',
      version: 4,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const geometryCollection = {
      findOne: vi.fn().mockResolvedValue(existingGeometry),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          ...existingGeometry,
          version: 5,
          erasableAt: '2026-04-25T10:00:00.000Z',
          erasableBy: 'user-2',
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue(geometryCollection as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue({} as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({} as never);

    await expect(markAnnotationGeometryErasable('project-1', 'ag_1', 4, 'user-2')).resolves.toEqual({
      ok: true,
      value: 5,
    });
  });

  it('restores only geometry when geometry becomes non-erasable', async () => {
    const existingGeometry = {
      id: 'ag_1',
      projectId: 'project-1',
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'scene',
      referenceId: 'scene-1',
      version: 4,
      erasableAt: '2026-04-24T10:00:00.000Z',
      erasableBy: 'user-1',
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const geometryCollection = {
      findOne: vi.fn().mockResolvedValue(existingGeometry),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          ...existingGeometry,
          version: 5,
          erasableAt: null,
          erasableBy: null,
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue(geometryCollection as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue({} as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({} as never);

    await expect(markAnnotationGeometryNonErasable('project-1', 'ag_1', 4, 'user-2')).resolves.toEqual({
      ok: true,
      value: 5,
    });
  });

  it('restores only data when data becomes non-erasable', async () => {
    const existingData = {
      id: 'ad_1',
      projectId: 'project-1',
      label: 'Label',
      description: 'Description',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-1',
      version: 2,
      erasableAt: '2026-04-24T10:00:00.000Z',
      erasableBy: 'user-1',
      createdAt: '2026-04-24T10:00:00.000Z',
      createdBy: 'user-1',
      updatedAt: '2026-04-24T10:00:00.000Z',
      updatedBy: 'user-1',
    };
    const dataCollection = {
      findOne: vi.fn().mockResolvedValue(existingData),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          ...existingData,
          version: 3,
          erasableAt: null,
          erasableBy: null,
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue({} as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue(dataCollection as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({} as never);

    await expect(markAnnotationDataNonErasable('project-1', 'ad_1', 2, 'user-2')).resolves.toEqual({
      ok: true,
      value: 3,
    });
  });
});

describe('annotation.service link restore semantics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('restores only the link when endpoints are already non-erasable', async () => {
    const session = {
      withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const linkCollection = {
      findOne: vi.fn().mockResolvedValue({
        id: 'al_1',
        projectId: 'project-1',
        geometryId: 'ag_1',
        dataId: 'ad_1',
        version: 7,
        erasableAt: '2026-04-24T10:00:00.000Z',
        erasableBy: 'user-1',
        createdAt: '2026-04-24T10:00:00.000Z',
        createdBy: 'user-1',
        updatedAt: '2026-04-24T10:00:00.000Z',
        updatedBy: 'user-1',
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          id: 'al_1',
          projectId: 'project-1',
          geometryId: 'ag_1',
          dataId: 'ad_1',
          version: 8,
          erasableAt: null,
          erasableBy: null,
          createdAt: '2026-04-24T10:00:00.000Z',
          createdBy: 'user-1',
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue(linkCollection as never);

    await expect(markAnnotationLinkNonErasable('project-1', 'al_1', 7, 'user-2')).resolves.toEqual({
      ok: true,
      value: 8,
    });
    expect(linkCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('restores only the link even when endpoints are still erasable', async () => {
    const session = {
      withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    const linkCollection = {
      findOne: vi.fn().mockResolvedValue({
        id: 'al_1',
        projectId: 'project-1',
        geometryId: 'ag_1',
        dataId: 'ad_1',
        version: 7,
        erasableAt: '2026-04-24T10:00:00.000Z',
        erasableBy: 'user-1',
        createdAt: '2026-04-24T10:00:00.000Z',
        createdBy: 'user-1',
        updatedAt: '2026-04-24T10:00:00.000Z',
        updatedBy: 'user-1',
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        value: {
          id: 'al_1',
          projectId: 'project-1',
          geometryId: 'ag_1',
          dataId: 'ad_1',
          version: 8,
          erasableAt: null,
          erasableBy: null,
          createdAt: '2026-04-24T10:00:00.000Z',
          createdBy: 'user-1',
          updatedAt: '2026-04-25T10:00:00.000Z',
          updatedBy: 'user-2',
        },
      }),
    };
    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue(linkCollection as never);

    await expect(markAnnotationLinkNonErasable('project-1', 'al_1', 7, 'user-2')).resolves.toEqual({
      ok: true,
      value: 8,
    });
    expect(linkCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});