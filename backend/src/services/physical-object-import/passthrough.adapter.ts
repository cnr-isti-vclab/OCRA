import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class PassthroughPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  constructor(public readonly sourceType: 'wikidata' | 'other') {}

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    if (!isRecord(context.payload)) {
      return {};
    }

    const dublinCore = isRecord(context.payload.dublinCore)
      ? (context.payload.dublinCore as Record<string, unknown>)
      : undefined;
    const sourceRecord = isRecord(context.payload.sourceRecord)
      ? (context.payload.sourceRecord as Record<string, unknown>)
      : undefined;
    const metadataPatch = isRecord(context.payload.metadataPatch)
      ? (context.payload.metadataPatch as Record<string, unknown>)
      : undefined;

    return {
      dublinCore,
      sourceRecord,
      metadataPatch
    };
  }
}
