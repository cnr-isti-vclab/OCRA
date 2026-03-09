import type { DublinCoreMetadata, PhysicalObjectSourceType } from '../../types/index.js';

export interface PhysicalObjectImportContext {
  sourceUri: string;
  payload?: unknown;
}

export interface PhysicalObjectImportResult {
  dublinCore?: Partial<DublinCoreMetadata>;
  sourceRecord?: Record<string, unknown>;
  metadataPatch?: Record<string, unknown>;
}

export interface PhysicalObjectImportAdapter {
  readonly sourceType: PhysicalObjectSourceType;
  importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult>;
}
