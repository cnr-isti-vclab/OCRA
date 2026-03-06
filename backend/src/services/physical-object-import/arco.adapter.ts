import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

export class ArcoPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'arco' as const;

  async importMetadata(_context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    throw new Error('ARCO import adapter is not implemented yet');
  }
}
