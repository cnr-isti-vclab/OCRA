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
    dublinCore,
    cidocCrm
  };
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
