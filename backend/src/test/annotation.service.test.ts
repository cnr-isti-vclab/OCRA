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
  markAnnotationDataErasable,
  markAnnotationDataNonErasable,
  markAnnotationGeometryErasable,
  markAnnotationGeometryNonErasable,
  markAnnotationLinkNonErasable,
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

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_1', 'user-1')).resolves.toBeNull();
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

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_2', 'user-1')).resolves.toBeNull();
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

    await expect(createAnnotationLink('project-1', 'ag_1', 'ad_3', 'user-1')).resolves.toBeNull();
  });
});

describe('annotation.service erasable cascades', () => {
  const updateMany = vi.fn();
  let session: ReturnType<typeof createSessionMock>;

  beforeEach(() => {
    vi.resetAllMocks();
    session = createSessionMock();
    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
  });

  it('marks links erasable when annotation data becomes erasable', async () => {
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
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({ updateMany } as never);

    await expect(markAnnotationDataErasable('project-1', 'ad_1', 2, 'user-2')).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledWith(
      { projectId: 'project-1', erasableAt: null, dataId: 'ad_1' },
      {
        $set: {
          erasableAt: expect.any(String),
          erasableBy: 'user-2',
          updatedAt: expect.any(String),
          updatedBy: 'user-2',
        },
        $inc: { version: 1 },
      },
      { session },
    );
  });

  it('marks links erasable when annotation geometry becomes erasable', async () => {
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
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({ updateMany } as never);

    await expect(markAnnotationGeometryErasable('project-1', 'ag_1', 4, 'user-2')).resolves.toBe(5);
    expect(updateMany).toHaveBeenCalledWith(
      { projectId: 'project-1', erasableAt: null, geometryId: 'ag_1' },
      {
        $set: {
          erasableAt: expect.any(String),
          erasableBy: 'user-2',
          updatedAt: expect.any(String),
          updatedBy: 'user-2',
        },
        $inc: { version: 1 },
      },
      { session },
    );
  });

  it('restores geometry-linked erasable links only when the data endpoint is non-erasable', async () => {
    const dataFind = vi.fn().mockReturnValue(createCursorMock([
      { id: 'ad_ready', projectId: 'project-1', erasableAt: null },
    ]));
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
    const linkFind = vi.fn().mockReturnValue(createCursorMock([
      { id: 'al_restore', geometryId: 'ag_1', dataId: 'ad_ready', erasableAt: 'ts' },
      { id: 'al_keep', geometryId: 'ag_1', dataId: 'ad_still_erasable', erasableAt: 'ts' },
      { id: 'al_ignore', geometryId: 'ag_1', dataId: 'ad_ready', erasableAt: null },
    ]));
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue(geometryCollection as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue({ find: dataFind } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({ find: linkFind, updateMany } as never);

    await expect(markAnnotationGeometryNonErasable('project-1', 'ag_1', 4, 'user-2')).resolves.toBe(5);
    expect(dataFind).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: { $in: ['ad_ready', 'ad_still_erasable'] },
      erasableAt: null,
    }, { session });
    expect(updateMany).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        id: { $in: ['al_restore'] },
        erasableAt: { $ne: null },
      },
      {
        $set: {
          erasableAt: null,
          erasableBy: null,
          updatedAt: expect.any(String),
          updatedBy: 'user-2',
        },
        $inc: { version: 1 },
      },
      { session },
    );
  });

  it('restores data-linked erasable links only when the geometry endpoint is non-erasable', async () => {
    const geometryFind = vi.fn().mockReturnValue(createCursorMock([
      { id: 'ag_ready', projectId: 'project-1', erasableAt: null },
    ]));
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
    const linkFind = vi.fn().mockReturnValue(createCursorMock([
      { id: 'al_restore', geometryId: 'ag_ready', dataId: 'ad_1', erasableAt: 'ts' },
      { id: 'al_keep', geometryId: 'ag_still_erasable', dataId: 'ad_1', erasableAt: 'ts' },
    ]));
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue({ find: geometryFind } as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue(dataCollection as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({ find: linkFind, updateMany } as never);

    await expect(markAnnotationDataNonErasable('project-1', 'ad_1', 2, 'user-2')).resolves.toBe(3);
    expect(geometryFind).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: { $in: ['ag_ready', 'ag_still_erasable'] },
      erasableAt: null,
    }, { session });
    expect(updateMany).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        id: { $in: ['al_restore'] },
        erasableAt: { $ne: null },
      },
      {
        $set: {
          erasableAt: null,
          erasableBy: null,
          updatedAt: expect.any(String),
          updatedBy: 'user-2',
        },
        $inc: { version: 1 },
      },
      { session },
    );
  });
});

describe('annotation.service link restore semantics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('restores a link only when both endpoints are already non-erasable', async () => {
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
    const geometryCollection = {
      findOne: vi.fn().mockResolvedValue({
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
      }),
    };
    const dataCollection = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ad_1',
        projectId: 'project-1',
        label: 'Label',
        description: 'Description',
        class: null,
        content: {},
        visibilityType: 'scene',
        visibilityId: 'scene-1',
        version: 3,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-04-24T10:00:00.000Z',
        createdBy: 'user-1',
        updatedAt: '2026-04-24T10:00:00.000Z',
        updatedBy: 'user-1',
      }),
    };

    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue(linkCollection as never);
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue(geometryCollection as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue(dataCollection as never);

    await expect(markAnnotationLinkNonErasable('project-1', 'al_1', 7, 'user-2')).resolves.toEqual({
      linkVersion: 8,
      geometryVersion: 4,
      dataVersion: 3,
    });
    expect(linkCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects link restore when either endpoint is still erasable', async () => {
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
      findOneAndUpdate: vi.fn(),
    };
    const geometryCollection = {
      findOne: vi.fn().mockResolvedValue({
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
      }),
    };
    const dataCollection = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ad_1',
        projectId: 'project-1',
        label: 'Label',
        description: 'Description',
        class: null,
        content: {},
        visibilityType: 'scene',
        visibilityId: 'scene-1',
        version: 3,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-04-24T10:00:00.000Z',
        createdBy: 'user-1',
        updatedAt: '2026-04-24T10:00:00.000Z',
        updatedBy: 'user-1',
      }),
    };

    vi.mocked(getMongoClient).mockResolvedValue({ startSession: () => session } as never);
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue(linkCollection as never);
    vi.mocked(getAnnotationGeometryCollection).mockResolvedValue(geometryCollection as never);
    vi.mocked(getAnnotationDataCollection).mockResolvedValue(dataCollection as never);

    await expect(markAnnotationLinkNonErasable('project-1', 'al_1', 7, 'user-2')).resolves.toBe(false);
    expect(linkCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });
});