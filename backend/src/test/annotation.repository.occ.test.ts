import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/mongo/client.js', () => ({
  getContentDb: vi.fn(),
}));

import { getContentDb } from '../lib/mongo/client.js';
import { conditionalUpdateAnnotationData } from '../repositories/annotation-data.repository.js';
import { conditionalUpdateAnnotationGeometry } from '../repositories/annotation-geometry.repository.js';
import { conditionalUpdateAnnotationLink } from '../repositories/annotation-link.repository.js';

const geometryDocument = {
  id: 'ag_occ',
  projectId: 'project-1',
  shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
  referenceType: 'scene',
  referenceId: 'scene-1',
  version: 4,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-04-24T10:00:00.000Z',
  createdBy: 'user-1',
  updatedAt: '2026-04-24T10:05:00.000Z',
  updatedBy: 'user-2',
};

const dataDocument = {
  id: 'ad_occ',
  projectId: 'project-1',
  label: 'Updated label',
  description: 'Updated description',
  class: null,
  content: { note: 'updated' },
  visibilityType: 'asset',
  visibilityId: 'asset-1',
  version: 2,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-04-24T10:00:00.000Z',
  createdBy: 'user-1',
  updatedAt: '2026-04-24T10:05:00.000Z',
  updatedBy: 'user-2',
};

const linkDocument = {
  id: 'al_occ',
  projectId: 'project-1',
  geometryId: 'ag_occ',
  dataId: 'ad_occ',
  version: 8,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-04-24T10:00:00.000Z',
  createdBy: 'user-1',
  updatedAt: '2026-04-24T10:05:00.000Z',
  updatedBy: 'user-2',
};

describe('annotation repository OCC updates', () => {
  const createIndex = vi.fn();
  const findOneAndUpdate = vi.fn();
  const collection = {
    createIndex,
    findOneAndUpdate,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    createIndex.mockResolvedValue('idx');
    vi.mocked(getContentDb).mockResolvedValue({
      collection: vi.fn().mockReturnValue(collection),
    } as never);
  });

  it.each([
    {
      label: 'geometry',
      id: 'ag_occ',
      expectedVersion: 3,
      update: { $set: { updatedBy: 'user-2' }, $inc: { version: 1 } },
      document: geometryDocument,
      fn: conditionalUpdateAnnotationGeometry,
    },
    {
      label: 'data',
      id: 'ad_occ',
      expectedVersion: 1,
      update: { $set: { label: 'Updated label' }, $inc: { version: 1 } },
      document: dataDocument,
      fn: conditionalUpdateAnnotationData,
    },
    {
      label: 'link',
      id: 'al_occ',
      expectedVersion: 7,
      update: { $set: { updatedBy: 'user-2' }, $inc: { version: 1 } },
      document: linkDocument,
      fn: conditionalUpdateAnnotationLink,
    },
  ])('returns updated result for $label when expectedVersion matches', async ({ fn, id, expectedVersion, update, document }) => {
    findOneAndUpdate.mockResolvedValueOnce({ value: document });

    const result = await fn(id, expectedVersion, update as never);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { id, version: expectedVersion },
      update,
      { returnDocument: 'after' },
    );
    expect(result).toEqual({
      ok: true,
      code: 'updated',
      document,
      expectedVersion,
      nextVersion: document.version,
    });
  });

  it.each([
    {
      label: 'geometry',
      id: 'ag_occ',
      expectedVersion: 3,
      update: { $set: { updatedBy: 'user-2' }, $inc: { version: 1 } },
      fn: conditionalUpdateAnnotationGeometry,
    },
    {
      label: 'data',
      id: 'ad_occ',
      expectedVersion: 1,
      update: { $set: { label: 'Updated label' }, $inc: { version: 1 } },
      fn: conditionalUpdateAnnotationData,
    },
    {
      label: 'link',
      id: 'al_occ',
      expectedVersion: 7,
      update: { $set: { updatedBy: 'user-2' }, $inc: { version: 1 } },
      fn: conditionalUpdateAnnotationLink,
    },
  ])('returns version_conflict for $label when expectedVersion is stale', async ({ fn, id, expectedVersion, update }) => {
    findOneAndUpdate.mockResolvedValueOnce({ value: null });

    const result = await fn(id, expectedVersion, update as never);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { id, version: expectedVersion },
      update,
      { returnDocument: 'after' },
    );
    expect(result).toEqual({
      ok: false,
      code: 'version_conflict',
      expectedVersion,
    });
  });
});