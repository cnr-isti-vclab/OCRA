import type {
  CidocCrmMetadata,
  DublinCoreMetadata,
  PhysicalObjectMetadata,
  PhysicalObjectSourceType
} from '../../types/index.js';

const SOURCE_TYPE_MAP: Record<string, PhysicalObjectSourceType> = {
  echoes: 'echoes',
  wikidata: 'wikidata',
  arco: 'arco',
  europeana: 'europeana',
  other: 'other'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePhysicalObjectSourceType(sourceType: unknown): PhysicalObjectSourceType {
  if (typeof sourceType !== 'string' || !sourceType.trim()) {
    throw new Error('sourceType is required');
  }

  const normalized = sourceType.trim().toLowerCase();
  const mapped = SOURCE_TYPE_MAP[normalized];
  if (!mapped) {
    throw new Error(`Unsupported sourceType: ${sourceType}`);
  }

  return mapped;
}

export function defaultPhysicalObjectMetadata(
  projectId: string,
  defaults?: {
    title?: string;
    description?: string;
  }
): PhysicalObjectMetadata {
  const dublinCore: DublinCoreMetadata = {};
  if (defaults?.title) dublinCore.title = defaults.title;
  if (defaults?.description) dublinCore.description = defaults.description;

  const cidocCrm: CidocCrmMetadata = {};

  return {
    sourceUri: `urn:ocra:project:${projectId}`,
    sourceType: 'other',
    sourceSelectionLocked: false,
    dublinCore,
    cidocCrm
  };
}

export function isPhysicalObjectSourceSelectionLocked(
  projectId: string,
  metadata?: Partial<PhysicalObjectMetadata> | null
): boolean {
  if (typeof metadata?.sourceSelectionLocked === 'boolean') {
    return metadata.sourceSelectionLocked;
  }

  if (!metadata) {
    return false;
  }

  const defaultSourceUri = `urn:ocra:project:${projectId}`;
  const sourceUri = typeof metadata.sourceUri === 'string' ? metadata.sourceUri.trim() : '';
  const sourceType = typeof metadata.sourceType === 'string' ? metadata.sourceType.trim().toLowerCase() : '';
  const hasSourceRecord = isRecord(metadata.sourceRecord) && Object.keys(metadata.sourceRecord).length > 0;
  const hasNonDefaultSourceUri = sourceUri.length > 0 && sourceUri !== defaultSourceUri;
  const hasImportedSourceType = sourceType.length > 0 && sourceType !== 'other';

  return hasSourceRecord || hasNonDefaultSourceUri || hasImportedSourceType;
}

export function normalizePhysicalObjectMetadata(
  projectId: string,
  metadata?: Partial<PhysicalObjectMetadata> | null,
  options?: {
    defaults?: {
      title?: string;
      description?: string;
    };
    sourceSelectionLocked?: boolean;
  }
): PhysicalObjectMetadata {
  const base = defaultPhysicalObjectMetadata(projectId, options?.defaults);
  const merged: PhysicalObjectMetadata = {
    ...base,
    ...(metadata || {}),
    dublinCore: isRecord(metadata?.dublinCore)
      ? (metadata.dublinCore as Partial<DublinCoreMetadata>)
      : base.dublinCore,
    cidocCrm: isRecord(metadata?.cidocCrm)
      ? (metadata.cidocCrm as Partial<CidocCrmMetadata>)
      : base.cidocCrm,
  };

  merged.sourceUri =
    typeof merged.sourceUri === 'string' && merged.sourceUri.trim().length > 0
      ? merged.sourceUri.trim()
      : base.sourceUri;
  merged.sourceType =
    typeof merged.sourceType === 'string' && merged.sourceType.trim().length > 0
      ? normalizePhysicalObjectSourceType(merged.sourceType)
      : base.sourceType;
  merged.sourceSelectionLocked =
    typeof options?.sourceSelectionLocked === 'boolean'
      ? options.sourceSelectionLocked
      : isPhysicalObjectSourceSelectionLocked(projectId, merged);

  return merged;
}

export function toPhysicalObjectMetadataPatch(
  input: unknown,
  options?: { allowExtraFields?: boolean }
): Partial<PhysicalObjectMetadata> {
  if (!isRecord(input)) {
    return {};
  }

  const patch: Partial<PhysicalObjectMetadata> = {};

  if (typeof input.sourceUri === 'string' && input.sourceUri.trim()) {
    patch.sourceUri = input.sourceUri.trim();
  }

  if (input.sourceType !== undefined) {
    patch.sourceType = normalizePhysicalObjectSourceType(input.sourceType);
  }

  if (typeof input.label === 'string') {
    patch.label = input.label.trim() || undefined;
  }

  if (isRecord(input.dublinCore)) {
    patch.dublinCore = input.dublinCore as Partial<DublinCoreMetadata>;
  }

  if (isRecord(input.cidocCrm)) {
    patch.cidocCrm = input.cidocCrm as Partial<CidocCrmMetadata>;
  }

  if (isRecord(input.sourceRecord)) {
    patch.sourceRecord = input.sourceRecord as Record<string, unknown>;
  }

  if (options?.allowExtraFields) {
    for (const [key, value] of Object.entries(input)) {
      if (['sourceUri', 'sourceType', 'dublinCore', 'cidocCrm', 'sourceRecord'].includes(key)) {
        continue;
      }
      patch[key] = value;
    }
  }

  return patch;
}
