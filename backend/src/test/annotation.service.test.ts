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
import { conditionalUpdateAnnotationData } from '../repositories/annotation-data.repository.js';
import { findAnnotationDataById } from '../repositories/annotation-data.repository.js';
import { conditionalUpdateAnnotationGeometry } from '../repositories/annotation-geometry.repository.js';
import { findAnnotationGeometryById } from '../repositories/annotation-geometry.repository.js';
import {
  findAnnotationLinkByPair,
  getAnnotationLinkCollection,
  insertAnnotationLink,
} from '../repositories/annotation-link.repository.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';
import {
  createAnnotationLink,
  markAnnotationDataErasable,
  markAnnotationGeometryErasable,
} from '../services/annotation.service.js';

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

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAnnotationLinkCollection).mockResolvedValue({ updateMany } as never);
  });

  it('marks links erasable when annotation data becomes erasable', async () => {
    vi.mocked(findAnnotationDataById).mockResolvedValue({
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
    } as never);
    vi.mocked(conditionalUpdateAnnotationData).mockResolvedValue({
      ok: true,
      code: 'updated',
      expectedVersion: 2,
      nextVersion: 3,
      document: {
        id: 'ad_1',
        projectId: 'project-1',
      },
    } as never);

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
    );
  });

  it('marks links erasable when annotation geometry becomes erasable', async () => {
    vi.mocked(findAnnotationGeometryById).mockResolvedValue({
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
    } as never);
    vi.mocked(conditionalUpdateAnnotationGeometry).mockResolvedValue({
      ok: true,
      code: 'updated',
      expectedVersion: 4,
      nextVersion: 5,
      document: {
        id: 'ag_1',
        projectId: 'project-1',
      },
    } as never);

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
    );
  });
});