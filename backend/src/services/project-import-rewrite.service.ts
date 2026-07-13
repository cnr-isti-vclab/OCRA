import { randomUUID } from 'crypto';
import path from 'path';
import type { HDTDocument } from '../types/index.js';
import type {
  AnnotationDataDocument,
  AnnotationGeometryDocument,
  AnnotationLinkDocument,
} from '../repositories/annotation.repository.types.js';
import { createAnnotationEntityId } from '../repositories/annotation.repository.ids.js';
import { generateSceneFile } from './hdt-metadata.service.js';
import { projectModel3dDir } from '../utils/project-static-paths.js';
import fs from 'fs/promises';
import { isDisplayableSceneAsset } from 'shared/openlime-layout';

export interface ProjectImportProjectPayload {
  project: {
    id: string;
    name: string;
    description: string;
    public: boolean;
    counter: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface ProjectImportAnnotationsPayload {
  geometries: AnnotationGeometryDocument[];
  data: AnnotationDataDocument[];
  links: AnnotationLinkDocument[];
}

export interface ProjectImportSourceBundle {
  projectPayload: ProjectImportProjectPayload;
  hdtDocument: HDTDocument | null;
  annotationsPayload: ProjectImportAnnotationsPayload;
}

export interface ImportIdMaps {
  assetIds: Map<string, string>;
  sceneIds: Map<string, string>;
  geometryIds: Map<string, string>;
  dataIds: Map<string, string>;
  linkIds: Map<string, string>;
}

export interface ImportIdMapOverrides {
  assetIds?: Map<string, string>;
  sceneIds?: Map<string, string>;
  geometryIds?: Map<string, string>;
  dataIds?: Map<string, string>;
  linkIds?: Map<string, string>;
}

function rewriteAssetUrl(value: string | null | undefined, sourceProjectId: string, targetProjectId: string) {
  if (!value) {
    return undefined;
  }

  return value
    .replaceAll(`/assets/projects/${sourceProjectId}/`, `/assets/projects/${targetProjectId}/`)
    .replaceAll(`/api/projects/${sourceProjectId}/`, `/api/projects/${targetProjectId}/`);
}

function createImportedAssetId() {
  return `asset_${randomUUID()}`;
}

function createImportedSceneId() {
  return `scene_${randomUUID()}`;
}

function requireMappedId(map: Map<string, string>, sourceId: string, label: string): string {
  const mappedId = map.get(sourceId);
  if (!mappedId) {
    throw new Error(`Unable to remap ${label}: ${sourceId}`);
  }
  return mappedId;
}

function remapAnnotationScopeReference(
  referenceType: 'scene' | 'asset',
  referenceId: string,
  idMaps: ImportIdMaps,
): string {
  const remappedId = referenceType === 'scene'
    ? idMaps.sceneIds.get(referenceId)
    : idMaps.assetIds.get(referenceId);

  if (!remappedId) {
    throw new Error(`Unable to remap ${referenceType} reference id: ${referenceId}`);
  }

  return remappedId;
}

export function buildImportIdMaps(
  sourceBundle: ProjectImportSourceBundle,
  overrides: ImportIdMapOverrides = {},
): ImportIdMaps {
  const hdtDocument = sourceBundle.hdtDocument;
  const geometryDocs = sourceBundle.annotationsPayload.geometries;
  const dataDocs = sourceBundle.annotationsPayload.data;
  const linkDocs = sourceBundle.annotationsPayload.links;

  if (!hdtDocument && (geometryDocs.length > 0 || dataDocs.length > 0 || linkDocs.length > 0)) {
    throw new Error('Project snapshot contains annotations but no HDT document to define scenes and assets.');
  }

  const assetIds = new Map<string, string>(overrides.assetIds ?? []);
  const sceneIds = new Map<string, string>(overrides.sceneIds ?? []);
  const geometryIds = new Map<string, string>(overrides.geometryIds ?? []);
  const dataIds = new Map<string, string>(overrides.dataIds ?? []);
  const linkIds = new Map<string, string>(overrides.linkIds ?? []);

  for (const asset of hdtDocument?.digitalAssets ?? []) {
    if (!assetIds.has(asset.id)) {
      assetIds.set(asset.id, createImportedAssetId());
    }
  }

  for (const scene of hdtDocument?.scenes ?? []) {
    if (!sceneIds.has(scene.id)) {
      sceneIds.set(scene.id, createImportedSceneId());
    }
  }

  for (const geometry of geometryDocs) {
    if (!geometryIds.has(geometry.id)) {
      geometryIds.set(geometry.id, createAnnotationEntityId('geometry'));
    }
  }

  for (const datum of dataDocs) {
    if (!dataIds.has(datum.id)) {
      dataIds.set(datum.id, createAnnotationEntityId('data'));
    }
  }

  for (const link of linkDocs) {
    if (!linkIds.has(link.id)) {
      linkIds.set(link.id, createAnnotationEntityId('link'));
    }
  }

  return {
    assetIds,
    sceneIds,
    geometryIds,
    dataIds,
    linkIds,
  };
}

export function rewriteImportedHdtDocument(
  sourceBundle: ProjectImportSourceBundle,
  targetProjectId: string,
  idMaps: ImportIdMaps,
) {
  const sourceProjectId = sourceBundle.projectPayload.project.id;
  const document = sourceBundle.hdtDocument;

  if (!document) {
    return null;
  }

  return {
    ...document,
    projectId: targetProjectId,
    physicalObjectMetadata: {
      ...document.physicalObjectMetadata,
      sourceUri: document.physicalObjectMetadata.sourceUri === `urn:ocra:project:${sourceProjectId}`
        ? `urn:ocra:project:${targetProjectId}`
        : document.physicalObjectMetadata.sourceUri,
    },
    echoesContext: document.echoesContext
      ? {
          ...document.echoesContext,
          assetRecords: document.echoesContext.assetRecords?.map((record) => ({
            ...record,
            assetId: requireMappedId(idMaps.assetIds, record.assetId, 'echoesContext.assetRecord.assetId'),
          })),
        }
      : undefined,
    digitalAssets: document.digitalAssets.map((asset) => ({
      ...asset,
      id: requireMappedId(idMaps.assetIds, asset.id, 'digitalAsset.id'),
      projectId: targetProjectId,
      entryPoint: rewriteAssetUrl(asset.entryPoint, sourceProjectId, targetProjectId),
      entryPointUrl: rewriteAssetUrl(asset.entryPointUrl, sourceProjectId, targetProjectId),
      publicUri: rewriteAssetUrl(asset.publicUri, sourceProjectId, targetProjectId),
      thumbnail: rewriteAssetUrl(asset.thumbnail, sourceProjectId, targetProjectId),
    })),
    scenes: document.scenes.map((scene) => ({
      ...scene,
      id: requireMappedId(idMaps.sceneIds, scene.id, 'scene.id'),
      assets: (scene.assets ?? []).map((assetRef) => ({
        ...assetRef,
        assetId: requireMappedId(idMaps.assetIds, assetRef.assetId, 'scene.assets[].assetId'),
      })),
    })),
  };
}

export function rewriteImportedAnnotations(
  sourceBundle: ProjectImportSourceBundle,
  targetProjectId: string,
  idMaps: ImportIdMaps,
) {
  const geometries = sourceBundle.annotationsPayload.geometries.map((geometry) => ({
    ...geometry,
    id: requireMappedId(idMaps.geometryIds, geometry.id, 'annotation geometry id'),
    projectId: targetProjectId,
    referenceId: remapAnnotationScopeReference(geometry.referenceType, geometry.referenceId, idMaps),
  }));

  const data = sourceBundle.annotationsPayload.data.map((datum) => ({
    ...datum,
    id: requireMappedId(idMaps.dataIds, datum.id, 'annotation data id'),
    projectId: targetProjectId,
    visibilityId: remapAnnotationScopeReference(datum.visibilityType, datum.visibilityId, idMaps),
  }));

  const links = sourceBundle.annotationsPayload.links.map((link) => ({
    ...link,
    id: requireMappedId(idMaps.linkIds, link.id, 'annotation link id'),
    projectId: targetProjectId,
    geometryId: requireMappedId(idMaps.geometryIds, link.geometryId, `annotation link geometryId for ${link.id}`),
    dataId: requireMappedId(idMaps.dataIds, link.dataId, `annotation link dataId for ${link.id}`),
  }));

  return { geometries, data, links };
}

export function normalizeImportedHdtDocument(document: Omit<HDTDocument, '_id'>): Omit<HDTDocument, '_id'> {
  const displayableAssets = document.digitalAssets.filter(isDisplayableSceneAsset);
  const assetIds = new Set(document.digitalAssets.map((asset) => asset.id));

  const normalizedScenes = (document.scenes ?? []).map((scene, index) => ({
    ...scene,
    isDefault: scene.isDefault === true || (index === 0 && !(document.scenes ?? []).some((candidate) => candidate.isDefault === true)),
    assets: (scene.assets ?? []).filter((assetRef) => assetIds.has(assetRef.assetId)),
    environment: {
      ...scene.environment,
      backgroundColor: scene.environment?.backgroundColor || scene.environment?.background || '#404040',
      showGround: scene.environment?.showGround ?? true,
    },
  }));

  if (normalizedScenes.length === 0 && displayableAssets.length > 0) {
    normalizedScenes.push({
      id: `scene_imported_default_${Date.now()}`,
      label: 'Default Scene',
      description: 'Default scene reconstructed during import',
      type: displayableAssets.some((asset) => asset.type === '3d-model') ? '3D' : '2D',
      isDefault: true,
      assets: displayableAssets.map((asset) => ({
        assetId: asset.id,
        visible: true,
      })),
      environment: {
        backgroundColor: '#404040',
        showGround: true,
      },
    });
  }

  const defaultScene = normalizedScenes.find((scene) => scene.isDefault === true) ?? normalizedScenes[0];
  if (defaultScene && defaultScene.assets.length === 0 && displayableAssets.length > 0) {
    defaultScene.assets = displayableAssets.map((asset) => ({
      assetId: asset.id,
      visible: true,
    }));
  }

  return {
    ...document,
    scenes: normalizedScenes,
  };
}

export async function syncLegacySceneFile(projectId: string, importedHdtDocument: Omit<HDTDocument, '_id'> | null) {
  if (!importedHdtDocument || importedHdtDocument.scenes.length === 0) {
    return;
  }

  const defaultScene = importedHdtDocument.scenes.find((scene) => scene.isDefault === true) ?? importedHdtDocument.scenes[0];
  if (!defaultScene) {
    return;
  }

  const sceneDescription = await generateSceneFile(projectId, defaultScene.id);
  const scenePath = path.join(projectModel3dDir(projectId), 'scene.json');
  await fs.writeFile(scenePath, `${JSON.stringify(sceneDescription, null, 2)}\n`, 'utf8');
}
