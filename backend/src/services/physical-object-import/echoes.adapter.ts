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
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

function resolveEchoesSelectionPayload(payload: unknown): {
  digitalTwinUri: string;
  namedGraphUri: string;
  digitalTwinLabel?: string;
  heritageEntityUri?: string;
  graphDate?: string;
  dublinCore: Partial<DublinCoreMetadata>;
} {
  if (!isRecord(payload)) {
    throw new Error('ECCCH import requires a selected named graph payload.');
  }

  const digitalTwinUri = toOptionalString(payload.digitalTwinUri);
  const namedGraphUri = toOptionalString(payload.namedGraphUri);
  const dublinCore = toDublinCoreMetadata(payload.dublinCore);

  if (!digitalTwinUri || !namedGraphUri) {
    throw new Error('ECCCH import requires both digitalTwinUri and namedGraphUri.');
  }

  return {
    digitalTwinUri,
    namedGraphUri,
    digitalTwinLabel: toOptionalString(payload.digitalTwinLabel),
    heritageEntityUri: toOptionalString(payload.heritageEntityUri),
    graphDate: toOptionalString(payload.graphDate),
    dublinCore,
  };
}

export class EchoesPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'echoes' as const;

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    const selection = resolveEchoesSelectionPayload(context.payload);

    return {
      dublinCore: selection.dublinCore,
      sourceRecord: {
        digitalTwinUri: selection.digitalTwinUri,
        namedGraphUri: selection.namedGraphUri,
        digitalTwinLabel: selection.digitalTwinLabel,
        heritageEntityUri: selection.heritageEntityUri,
        graphDate: selection.graphDate,
        importedAt: new Date().toISOString(),
        sourceUri: context.sourceUri,
      },
      ...(selection.heritageEntityUri
        ? { metadataPatch: { sourceUri: selection.heritageEntityUri } }
        : {}),
    };
  }
}
