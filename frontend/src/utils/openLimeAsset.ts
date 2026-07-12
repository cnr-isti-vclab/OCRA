import type { OpenLimeLayout } from 'shared/types';
import { inferOpenLimeLayoutFromUrl } from 'shared/openlime-layout';

export interface OpenLimeAssetDescriptor {
  type: string;
  entryPointUrl?: string;
  entryPoint?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
}

const OPENLIME_LAYOUTS = new Set<OpenLimeLayout>([
  'image',
  'deepzoom',
  'deepzoom1px',
  'google',
  'zoomify',
  'iiif',
  'iip',
  'tarzoom',
  'itarzoom',
]);

/** Validates an unknown value as an OpenLIME layout identifier. */
export function parseOpenLimeLayout(value: unknown): OpenLimeLayout | null {
  return typeof value === 'string' && OPENLIME_LAYOUTS.has(value as OpenLimeLayout)
    ? value as OpenLimeLayout
    : null;
}

/**
 * Resolves the OpenLIME layout for an image asset.
 * Explicit HDT metadata takes precedence because some layouts cannot be
 * distinguished from their URL alone (notably IIIF, IIP, and Google tiles).
 */
export function resolveOpenLimeImageLayout(asset: OpenLimeAssetDescriptor): OpenLimeLayout {
  const explicitLayout = parseOpenLimeLayout(asset.metadata?.openLimeLayout)
    ?? parseOpenLimeLayout(asset.metadata?.rtiLayout);
  if (explicitLayout) {
    return explicitLayout;
  }

  return inferOpenLimeLayoutFromUrl(
    asset.entryPointUrl ?? asset.entryPoint ?? asset.fileName ?? '',
  ) ?? 'image';
}
