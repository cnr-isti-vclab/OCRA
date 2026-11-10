import type { DigitalAsset } from '../../routes/HDTPage.tsx';
import type { ModelDefinition, SceneDescription } from '../../../../shared/scene-types.ts';
import { getApiBase } from '../../config/oauth.ts';

/** Frozen openlime-asset document (subset needed by the host). */
export interface OpenLimeAssetDocument {
  format: 'openlime-asset';
  formatVersion: string;
  id: string;
  sources?: Record<string, { uri?: string; layout?: { type?: string } }>;
  root: string;
  nodes: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenLimeSceneDocument {
  format: 'openlime-scene';
  formatVersion: string;
  id: string;
  label?: string;
  root: {
    spatial: {
      space: { id: string; type: 'cartesian2d' };
    };
  };
  viewer?: { fitPolicy?: string; autofit?: boolean };
  assets: Array<{
    id: string;
    label?: string;
    asset: string;
    transform: Record<string, unknown>;
  }>;
}

export interface ResolvedOpenLimePackage {
  digitalAsset: DigitalAsset;
  documentUrl: string;
  baseUrl: string;
  document: OpenLimeAssetDocument;
  model: ModelDefinition;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

/** Re-anchor absolute /assets/projects URLs to the current API base. */
export function normalizeOpenLimePackageUrl(url: string): string {
  if (!(url.startsWith('http://') || url.startsWith('https://'))) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/assets/projects/')) {
      return `${normalizeBaseUrl(getApiBase())}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep original URL if parsing fails.
  }
  return url;
}

function pathnameOf(url: string): string {
  try {
    return new URL(url, 'http://local.invalid').pathname;
  } catch {
    return url;
  }
}

/**
 * Public URL of the openlime-asset document, if this DigitalAsset is a package.
 * Detected via metadata.openLimeAssetUrl or an entryPointUrl ending in asset.json.
 */
export function openLimeAssetDocumentUrl(asset: DigitalAsset): string | null {
  const metaUrl = asset.metadata?.openLimeAssetUrl;
  if (typeof metaUrl === 'string' && metaUrl.trim()) {
    return normalizeOpenLimePackageUrl(metaUrl.trim());
  }
  if (!asset.entryPointUrl) {
    return null;
  }
  const url = normalizeOpenLimePackageUrl(asset.entryPointUrl);
  if (/\/asset\.json$/i.test(pathnameOf(url))) {
    return url;
  }
  return null;
}

/**
 * Candidate asset.json next to a legacy info.json entry point (same extracted folder).
 * Used after current RTI ingestion, which still publishes info.json as entryPointUrl.
 */
export function siblingOpenLimeAssetDocumentUrl(asset: DigitalAsset): string | null {
  if (openLimeAssetDocumentUrl(asset)) {
    return null;
  }
  if (!asset.entryPointUrl) {
    return null;
  }
  const url = normalizeOpenLimePackageUrl(asset.entryPointUrl);
  if (!/\/info\.json$/i.test(pathnameOf(url))) {
    return null;
  }
  return url.replace(/info\.json(?:\?.*)?$/i, 'asset.json');
}

/** Explicit package URL, or a sibling asset.json that responds OK. */
export async function resolveOpenLimeAssetDocumentUrl(asset: DigitalAsset): Promise<string | null> {
  const explicit = openLimeAssetDocumentUrl(asset);
  if (explicit) {
    return explicit;
  }
  const sibling = siblingOpenLimeAssetDocumentUrl(asset);
  if (!sibling) {
    return null;
  }
  try {
    const head = await fetch(sibling, { method: 'HEAD' });
    if (head.ok) {
      return sibling;
    }
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(sibling, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      if (get.ok || get.status === 206) {
        return sibling;
      }
    }
  } catch {
    // Fall through: treat as legacy RTI/image.
  }
  return null;
}

export function isOpenLimeAssetPackage(asset: DigitalAsset): boolean {
  return openLimeAssetDocumentUrl(asset) !== null;
}

/** Directory that contains asset.json — base for relative source URIs inside the zip. */
export function packageBaseUrlFromDocumentUrl(documentUrl: string): string {
  const resolved = new URL(documentUrl, typeof window !== 'undefined' ? window.location.href : 'http://local.invalid');
  resolved.search = '';
  resolved.hash = '';
  resolved.pathname = resolved.pathname.replace(/\/[^/]*$/, '/');
  return resolved.toString();
}

/** Resolve a package-relative source.uri against the extracted package folder. */
export function resolveOpenLimeSourceUrl(
  source: { uri?: string },
  baseUrl: string,
): string {
  const uri = source.uri ?? '';
  if (!uri) {
    return '';
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(uri)) {
    return normalizeOpenLimePackageUrl(uri);
  }
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(uri, base).href;
}

/** Instance ids must be OpenLIME local ids: letter first. */
export function toOpenLimeInstanceId(rawId: string): string {
  if (/^[A-Za-z][A-Za-z0-9._:-]*$/.test(rawId)) {
    return rawId;
  }
  return `i_${rawId.replace(/[^A-Za-z0-9._:-]/g, '_')}`;
}

export function modelToOpenLimeTransform(
  model: ModelDefinition,
  sceneRotationUnits?: 'deg' | 'rad',
): Record<string, unknown> {
  const scale = Array.isArray(model.scale) ? model.scale[0] ?? 1 : model.scale ?? 1;
  const pos = model.position || [0, 0, 0];
  const units = model.rotationUnits ?? sceneRotationUnits ?? 'rad';
  const rotScale = units === 'rad' ? 180 / Math.PI : 1;
  const rotation = model.rotation ? model.rotation[2] * rotScale : 0;
  const x = pos[0] ?? 0;
  const y = pos[1] ?? 0;
  if (x === 0 && y === 0 && rotation === 0 && scale === 1) {
    return { type: 'identity' };
  }
  return {
    type: 'similarity2d',
    translation: [x, y],
    rotation,
    scale,
  };
}

/**
 * Minimal openlime-scene for N package instances (generated from the OCRA scene models).
 * Instance `asset` is the frozen document id; host passes documents in options.assets.
 */
export function buildMinimalOpenLimeScene(args: {
  sceneId: string;
  label?: string;
  spaceId?: string;
  instances: Array<{
    instanceId: string;
    label?: string;
    assetId: string;
    transform: Record<string, unknown>;
  }>;
}): OpenLimeSceneDocument {
  const spaceId = args.spaceId ?? `${args.sceneId}:space`;
  return {
    format: 'openlime-scene',
    formatVersion: '1.0.0',
    id: args.sceneId.startsWith('urn:') || args.sceneId.includes(':')
      ? args.sceneId
      : `urn:ocra:scene:${args.sceneId}`,
    label: args.label,
    root: {
      spatial: {
        space: { id: spaceId.includes(':') ? spaceId : `urn:ocra:space:${spaceId}`, type: 'cartesian2d' },
      },
    },
    viewer: { fitPolicy: 'active', autofit: false },
    assets: args.instances.map((instance) => ({
      id: instance.instanceId,
      label: instance.label,
      asset: instance.assetId,
      transform: instance.transform,
    })),
  };
}

export async function fetchOpenLimeAssetDocument(documentUrl: string): Promise<OpenLimeAssetDocument> {
  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch openlime-asset at ${documentUrl}: HTTP ${response.status}`);
  }
  const document = await response.json() as OpenLimeAssetDocument;
  if (!document || document.format !== 'openlime-asset' || typeof document.id !== 'string') {
    throw new Error(`Invalid openlime-asset document at ${documentUrl}`);
  }
  return document;
}

/** Resolve scene models that are openlime-asset packages (legacy RTI/image left out). */
export async function resolveOpenLimePackagesForScene(
  sceneDesc: SceneDescription,
  digitalAssets: DigitalAsset[],
): Promise<ResolvedOpenLimePackage[]> {
  const packages: ResolvedOpenLimePackage[] = [];
  for (const model of sceneDesc.models) {
    const digitalAsset = digitalAssets.find((asset) => asset.id === model.id);
    if (!digitalAsset) {
      continue;
    }
    const documentUrl = openLimeAssetDocumentUrl(digitalAsset);
    if (!documentUrl) {
      continue;
    }
    const document = await fetchOpenLimeAssetDocument(documentUrl);
    packages.push({
      digitalAsset,
      documentUrl,
      baseUrl: packageBaseUrlFromDocumentUrl(documentUrl),
      document,
      model,
    });
  }
  return packages;
}
