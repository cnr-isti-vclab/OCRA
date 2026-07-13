import type { OpenLimeLayout } from './types.ts';

export const OPENLIME_RASTER_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'] as const;

export interface DisplayableAssetDescriptor {
  type: string;
  entryPointUrl?: string | null;
}

export interface OpenLime2DAssetDescriptor extends DisplayableAssetDescriptor {
  type: 'rti' | 'image';
  entryPointUrl: string;
}

export interface DisplayableSceneAssetDescriptor extends DisplayableAssetDescriptor {
  type: '3d-model' | 'rti' | 'image';
  entryPointUrl: string;
}

export type PortableAssetType = '3d-model' | 'rti' | 'image' | 'video' | 'other';

const PORTABLE_3D_EXTENSIONS = ['.glb', '.gltf', '.ply', '.obj', '.fbx', '.stl', '.dae', '.3ds'] as const;

/** Classifies a portable asset using MIME first and its source URL as fallback. */
export function classifyPortableAssetType(format: string | null, source: string | null): PortableAssetType {
  const normalizedFormat = format?.trim().toLowerCase() ?? '';
  if (normalizedFormat === 'image/rti' || normalizedFormat === 'application/zip') return 'rti';
  if (normalizedFormat.startsWith('model/') || normalizedFormat.includes('3d')) return '3d-model';
  if (normalizedFormat.startsWith('image/')) return 'image';
  if (normalizedFormat.startsWith('video/')) return 'video';

  if (source) {
    const pathname = new URL(source, 'http://localhost/').pathname.toLowerCase();
    if (inferOpenLimeLayoutFromUrl(source)) return 'image';
    if (PORTABLE_3D_EXTENSIONS.some((extension) => pathname.endsWith(extension))) return '3d-model';
    if (pathname.endsWith('.zip')) return 'rti';
  }

  return 'other';
}

/** Returns whether an asset is renderable in the OpenLIME 2D viewer. */
export function isOpenLime2DAsset(asset: DisplayableAssetDescriptor): asset is OpenLime2DAssetDescriptor {
  return (asset.type === 'rti' || asset.type === 'image')
    && typeof asset.entryPointUrl === 'string'
    && asset.entryPointUrl.length > 0;
}

/** Returns whether an asset can be included in a generated OCRA scene. */
export function isDisplayableSceneAsset(asset: DisplayableAssetDescriptor): asset is DisplayableSceneAssetDescriptor {
  return asset.type === '3d-model'
    ? typeof asset.entryPointUrl === 'string' && asset.entryPointUrl.length > 0
    : isOpenLime2DAsset(asset);
}

/** Returns whether a filename or MIME type identifies a supported raster image. */
export function isSupportedOpenLimeRasterImage(filename: string, mimeType?: string): boolean {
  const normalizedName = filename.toLowerCase().split(/[?#]/, 1)[0];
  if (OPENLIME_RASTER_IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))) {
    return true;
  }
  const normalizedMimeType = mimeType?.split(';', 1)[0].trim().toLowerCase();
  return normalizedMimeType === 'image/jpeg'
    || normalizedMimeType === 'image/png'
    || normalizedMimeType === 'image/webp'
    || normalizedMimeType === 'image/gif'
    || normalizedMimeType === 'image/avif';
}

/** Returns the standard MIME type implied by a supported raster image URL. */
export function openLimeRasterMimeTypeFromUrl(sourceUrl: string): string | undefined {
  const pathname = new URL(sourceUrl, 'http://localhost/').pathname.toLowerCase();
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  if (pathname.endsWith('.avif')) return 'image/avif';
  return undefined;
}

/**
 * Infers layouts whose entry point has a distinctive filename or extension.
 * Layouts such as IIIF, IIP, Google tiles, and deepzoom1px require explicit
 * metadata because their URLs are not intrinsically distinguishable.
 */
export function inferOpenLimeLayoutFromUrl(url: string): OpenLimeLayout | null {
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost/').pathname.toLowerCase();
  } catch {
    pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  }

  const fileName = pathname.split('/').pop() ?? '';
  if (fileName === 'imageproperties.xml') {
    return 'zoomify';
  }
  if (fileName === 'planes.tzi') {
    return 'itarzoom';
  }
  if (fileName.endsWith('.tzi')) {
    return 'tarzoom';
  }
  if (fileName.endsWith('.dzi')) {
    return 'deepzoom';
  }
  if (isSupportedOpenLimeRasterImage(fileName)) {
    return 'image';
  }

  return null;
}

/** Returns whether a layout depends on resources adjacent to its remote manifest. */
export function isOpenLimeRemoteManifestLayout(layout: OpenLimeLayout | null): boolean {
  return layout === 'deepzoom'
    || layout === 'deepzoom1px'
    || layout === 'zoomify'
    || layout === 'tarzoom'
    || layout === 'itarzoom'
    || layout === 'iiif'
    || layout === 'iip'
    || layout === 'google';
}
