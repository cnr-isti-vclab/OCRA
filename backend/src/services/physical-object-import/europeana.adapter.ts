import type { DublinCoreMetadata } from '../../types/index.js';
import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult,
} from './adapter.interface.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toDublinCoreMetadata(value: unknown): Partial<DublinCoreMetadata> {
  if (!isRecord(value)) {
    return {};
  }

  const dublinCore: Partial<DublinCoreMetadata> = {};
  const scalarKeys: Array<keyof DublinCoreMetadata> = [
    'title',
    'creator',
    'subject',
    'description',
    'date',
    'type',
    'identifier',
    'source',
    'language',
    'coverage',
    'rights',
  ];

  for (const key of scalarKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      dublinCore[key] = candidate.trim();
    }
  }

  return dublinCore;
}

function resolveEuropeanaSelectionPayload(payload: unknown): {
  choUri: string;
  mediaUrl?: string;
  license?: string;
  provider?: string;
  dataProvider?: string;
  thumbnailUrl?: string;
  dublinCore: Partial<DublinCoreMetadata>;
} {
  if (!isRecord(payload)) {
    throw new Error('Europeana import requires a selected record payload.');
  }

  const choUri = toOptionalString(payload.choUri) ?? toOptionalString(payload.sourceUri);
  const dublinCore = toDublinCoreMetadata(payload.dublinCore);

  if (!choUri) {
    throw new Error('Europeana import requires a record URI.');
  }

  return {
    choUri,
    mediaUrl: toOptionalString(payload.mediaUrl),
    license: toOptionalString(payload.license),
    provider: toOptionalString(payload.provider),
    dataProvider: toOptionalString(payload.dataProvider),
    thumbnailUrl: toOptionalString(payload.thumbnailUrl),
    dublinCore,
  };
}

export class EuropeanaPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'europeana' as const;

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    const selection = resolveEuropeanaSelectionPayload(context.payload);

    return {
      dublinCore: selection.dublinCore,
      sourceRecord: {
        choUri: selection.choUri,
        mediaUrl: selection.mediaUrl,
        license: selection.license,
        provider: selection.provider,
        dataProvider: selection.dataProvider,
        thumbnailUrl: selection.thumbnailUrl,
        importedAt: new Date().toISOString(),
        sourceUri: context.sourceUri,
      },
      metadataPatch: {
        sourceUri: selection.choUri,
      },
    };
  }
}
