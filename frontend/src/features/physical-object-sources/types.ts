import type { ComponentType } from 'react';

export type PhysicalObjectSourceType = 'echoes' | 'arco' | 'wikidata' | 'europeana' | 'file';

export interface PhysicalObjectMetadataRecord {
  sourceUri?: string;
  sourceType?: string;
  sourceSelectionLocked?: boolean;
  dublinCore?: Record<string, unknown>;
  cidocCrm?: Record<string, unknown>;
  sourceRecord?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PhysicalObjectImportRequest {
  sourceType: 'echoes' | 'arco' | 'wikidata' | 'europeana' | 'other';
  sourceUri: string;
  payload?: Record<string, unknown>;
}

export interface PhysicalObjectSourceAfterImportContext<TState> {
  projectId: string;
  state: TState;
  importedDocument: unknown;
}

export interface PhysicalObjectSourceAfterImportResult {
  successMessage?: string;
  warningMessage?: string;
}

export interface PhysicalObjectSourceFormProps<TState> {
  state: TState;
  onChange: (next: TState) => void;
  disabled: boolean;
}

export interface OntologyMappingTriple {
  predicate: string;
  value: string;
}

export interface OntologyMappingResult {
  classId: 'HC1_Heritage_Entity';
  sourceType: string;
  triples: OntologyMappingTriple[];
  notes?: string[];
}

export interface PhysicalObjectSourceAdapter<TState = any> {
  sourceType: PhysicalObjectSourceType;
  label: string;
  description: string;
  status: 'available' | 'placeholder';
  createInitialState: () => TState;
  ImportForm: ComponentType<PhysicalObjectSourceFormProps<TState>>;
  buildImportRequest: (projectId: string, state: TState) => PhysicalObjectImportRequest;
  afterImport?: (
    context: PhysicalObjectSourceAfterImportContext<TState>
  ) => Promise<PhysicalObjectSourceAfterImportResult | void>;
  MetadataView: ComponentType<{ metadata: PhysicalObjectMetadataRecord | null }>;
  mapToHdtOntology: (metadata: PhysicalObjectMetadataRecord | null) => OntologyMappingResult;
}
