import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { findHdtByProjectId } from '../repositories/hdt.repository.js';
import { findAnnotationGeometriesByProjectId } from '../repositories/annotation-geometry.repository.js';
import { findAnnotationDataByProjectId } from '../repositories/annotation-data.repository.js';
import { findAnnotationLinksByProjectId } from '../repositories/annotation-link.repository.js';
import { projectEchoesDir } from '../utils/project-static-paths.js';
import type { EchoesProjectSnapshotReference } from 'shared';
import type { HDTDocument } from '../types/index.js';
import type {
  AnnotationDataDocument,
  AnnotationGeometryDocument,
  AnnotationLinkDocument,
} from '../repositories/annotation.repository.types.js';
import type { ProjectImportSourceBundle } from './project-import-rewrite.service.js';

export const OCRA_PROJECT_SNAPSHOT_FORMAT = 'application/vnd.ocra.project-snapshot+json';
export const OCRA_PROJECT_SNAPSHOT_VERSION = 1;

export interface OcraProjectSnapshotManifest {
  format: 'ocra-project-snapshot';
  version: number;
  exportedAt: string;
  sourceProjectId: string;
  sourceProjectName: string;
  includes: {
    hdt: boolean;
    annotations: boolean;
  };
}

export interface OcraProjectSnapshotPayload {
  manifest: OcraProjectSnapshotManifest;
  project: {
    id: string;
    name: string;
    description: string;
    public: boolean;
    counter: string;
    createdAt: string;
    updatedAt: string;
  };
  hdtDocument: Omit<HDTDocument, '_id'> | null;
  annotations: {
    geometries: Array<Omit<AnnotationGeometryDocument, '_id'>>;
    data: Array<Omit<AnnotationDataDocument, '_id'>>;
    links: Array<Omit<AnnotationLinkDocument, '_id'>>;
  };
}

export interface BuildOcraProjectSnapshotInput {
  project: {
    id: string;
    name: string;
    description: string;
    public: boolean;
    counter: bigint;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface StoredOcraProjectSnapshot {
  reference: EchoesProjectSnapshotReference;
  absolutePath: string;
  relativePath: string;
  payload: OcraProjectSnapshotPayload;
  payloadJson: string;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function stripMongoId<T extends { _id?: unknown }>(value: T): Omit<T, '_id'> {
  const { _id: _ignored, ...rest } = value;
  return rest;
}

export function buildOcraProjectSnapshotReference(publicBaseUrl: string, relativePath: string, payload: string): EchoesProjectSnapshotReference {
  const checksum = createHash('sha256').update(payload).digest('hex');
  return {
    url: new URL(relativePath, publicBaseUrl.endsWith('/') ? publicBaseUrl : `${publicBaseUrl}/`).toString(),
    format: OCRA_PROJECT_SNAPSHOT_FORMAT,
    version: OCRA_PROJECT_SNAPSHOT_VERSION,
    checksum,
  };
}

export async function buildOcraProjectSnapshot(input: BuildOcraProjectSnapshotInput): Promise<OcraProjectSnapshotPayload> {
  const [hdtDocument, geometries, data, links] = await Promise.all([
    findHdtByProjectId(input.project.id),
    findAnnotationGeometriesByProjectId(input.project.id),
    findAnnotationDataByProjectId(input.project.id),
    findAnnotationLinksByProjectId(input.project.id),
  ]);

  return {
    manifest: {
      format: 'ocra-project-snapshot',
      version: OCRA_PROJECT_SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      sourceProjectId: input.project.id,
      sourceProjectName: input.project.name,
      includes: {
        hdt: hdtDocument !== null,
        annotations: geometries.length > 0 || data.length > 0 || links.length > 0,
      },
    },
    project: {
      id: input.project.id,
      name: input.project.name,
      description: input.project.description,
      public: input.project.public,
      counter: input.project.counter.toString(),
      createdAt: input.project.createdAt.toISOString(),
      updatedAt: input.project.updatedAt.toISOString(),
    },
    hdtDocument: hdtDocument ? stripMongoId(hdtDocument) : null,
    annotations: {
      geometries: geometries.map(stripMongoId),
      data: data.map(stripMongoId),
      links: links.map(stripMongoId),
    },
  };
}

export async function storeOcraProjectSnapshot(
  input: BuildOcraProjectSnapshotInput & { publicBaseUrl: string },
): Promise<StoredOcraProjectSnapshot> {
  const payload = await buildOcraProjectSnapshot(input);
  const payloadJson = `${JSON.stringify(payload, jsonReplacer, 2)}\n`;
  const fileName = `project-snapshot-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`;
  const relativePath = `/assets/projects/${encodeURIComponent(input.project.id)}/echoes/${encodeURIComponent(fileName)}`;
  const absolutePath = path.join(projectEchoesDir(input.project.id), fileName);
  await fs.mkdir(projectEchoesDir(input.project.id), { recursive: true });
  await fs.writeFile(absolutePath, payloadJson, 'utf8');

  return {
    reference: {
      ...buildOcraProjectSnapshotReference(input.publicBaseUrl, relativePath, payloadJson),
      exportedAt: payload.manifest.exportedAt,
      includesAnnotations: payload.manifest.includes.annotations,
    },
    absolutePath,
    relativePath,
    payload,
    payloadJson,
  };
}

export function isOcraProjectSnapshotPayload(value: unknown): value is OcraProjectSnapshotPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const manifest = candidate.manifest;
  const project = candidate.project;
  const annotations = candidate.annotations;

  if (!manifest || typeof manifest !== 'object' || !project || typeof project !== 'object' || !annotations || typeof annotations !== 'object') {
    return false;
  }

  return (
    (manifest as Record<string, unknown>).format === 'ocra-project-snapshot' &&
    typeof (manifest as Record<string, unknown>).version === 'number' &&
    Array.isArray((annotations as Record<string, unknown>).geometries) &&
    Array.isArray((annotations as Record<string, unknown>).data) &&
    Array.isArray((annotations as Record<string, unknown>).links)
  );
}

export async function fetchOcraProjectSnapshot(snapshotUrl: string): Promise<OcraProjectSnapshotPayload> {
  const response = await fetch(snapshotUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OCRA ECCCH Import/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download OCRA project snapshot: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!isOcraProjectSnapshotPayload(payload)) {
    throw new Error('The linked OCRA project snapshot is invalid or unsupported');
  }

  if ((payload.manifest.version ?? 0) !== OCRA_PROJECT_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported OCRA project snapshot version: ${payload.manifest.version}`);
  }

  return payload;
}

export function projectSnapshotToImportSourceBundle(snapshot: OcraProjectSnapshotPayload): ProjectImportSourceBundle {
  return {
    projectPayload: {
      project: snapshot.project,
    },
    hdtDocument: snapshot.hdtDocument,
    annotationsPayload: {
      geometries: snapshot.annotations.geometries,
      data: snapshot.annotations.data,
      links: snapshot.annotations.links,
    },
  };
}
