import { arcoSourceAdapter } from './arco';
import { echoesSourceAdapter } from './echoes';
import { europeanaSourceAdapter } from './europeana';
import { fileSourceAdapter } from './file';
import { wikidataSourceAdapter } from './wikidata';
import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceType,
} from './types';

export type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceType,
} from './types';

export const physicalObjectSourceAdapters: PhysicalObjectSourceAdapter[] = [
  echoesSourceAdapter,
  arcoSourceAdapter,
  wikidataSourceAdapter,
  europeanaSourceAdapter,
  fileSourceAdapter,
];

const adaptersByType: Record<PhysicalObjectSourceType, PhysicalObjectSourceAdapter> = {
  echoes: echoesSourceAdapter,
  arco: arcoSourceAdapter,
  wikidata: wikidataSourceAdapter,
  europeana: europeanaSourceAdapter,
  file: fileSourceAdapter,
};

export function isKnownPhysicalObjectSourceType(value: unknown): value is PhysicalObjectSourceType {
  return typeof value === 'string' && value in adaptersByType;
}

export function getPhysicalObjectSourceAdapter(
  sourceType: unknown
): PhysicalObjectSourceAdapter | null {
  if (!isKnownPhysicalObjectSourceType(sourceType)) {
    return null;
  }
  return adaptersByType[sourceType];
}
