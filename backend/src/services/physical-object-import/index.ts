import type { PhysicalObjectSourceType } from '../../types/index.js';
import type { PhysicalObjectImportAdapter } from './adapter.interface.js';
import { ArcoPhysicalObjectImportAdapter } from './arco.adapter.js';
import { EchoesPhysicalObjectImportAdapter } from './echoes.adapter.js';
import { EuropeanaPhysicalObjectImportAdapter } from './europeana.adapter.js';
import { PassthroughPhysicalObjectImportAdapter } from './passthrough.adapter.js';
import { WikidataPhysicalObjectImportAdapter } from './wikidata.adapter.js';

const adapters: Record<PhysicalObjectSourceType, PhysicalObjectImportAdapter> = {
  echoes: new EchoesPhysicalObjectImportAdapter(),
  wikidata: new WikidataPhysicalObjectImportAdapter(),
  arco: new ArcoPhysicalObjectImportAdapter(),
  europeana: new EuropeanaPhysicalObjectImportAdapter(),
  other: new PassthroughPhysicalObjectImportAdapter('other')
};

export function getPhysicalObjectImportAdapter(sourceType: PhysicalObjectSourceType): PhysicalObjectImportAdapter {
  return adapters[sourceType];
}
