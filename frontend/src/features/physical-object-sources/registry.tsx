import { arcoSourceAdapter } from './arco';
import { echoesSourceAdapter } from './echoes';
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
];

const adaptersByType: Record<PhysicalObjectSourceType, PhysicalObjectSourceAdapter> = {
  echoes: echoesSourceAdapter,
  arco: arcoSourceAdapter,
  wikidata: wikidataSourceAdapter,
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