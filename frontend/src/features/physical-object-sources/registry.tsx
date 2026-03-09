import { arcoSourceAdapter } from './arco';
import { echoesSourceAdapter } from './echoes';
import type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceType,
} from './types';

export type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceType,
} from './types';

const wikidataSourceAdapter: PhysicalObjectSourceAdapter = {
  sourceType: 'wikidata',
  label: 'Wikidata',
  description: 'Wikidata source adapter placeholder.',
  status: 'placeholder',
  createInitialState: () => ({ qid: '' }),
  ImportForm: ({ state, onChange, disabled }) => (
    <div className="border rounded p-3 bg-light">
      <h6 className="mb-3">Wikidata Import Parameters</h6>
      <input
        type="text"
        className="form-control"
        placeholder="QXXXX"
        value={String((state as any)?.qid || '')}
        onChange={(e) => onChange({ ...(state as any), qid: e.target.value })}
        disabled={disabled}
      />
      <small className="form-text text-muted">
        Wikidata adapter placeholder.
      </small>
    </div>
  ),
  buildImportRequest: (_projectId, state: any) => {
    const qid = String(state?.qid || '').trim();
    return {
      sourceType: 'wikidata',
      sourceUri: qid ? `https://www.wikidata.org/entity/${qid}` : 'https://www.wikidata.org/entity/Q0',
      payload: { qid },
    };
  },
  MetadataView: ({ metadata }) => (
    <div className="border rounded p-3 bg-light">
      <pre className="mb-0 small">{JSON.stringify(metadata, null, 2)}</pre>
    </div>
  ),
  mapToHdtOntology: (metadata: PhysicalObjectMetadataRecord | null): OntologyMappingResult => ({
    classId: 'HC1',
    sourceType: 'wikidata',
    triples: [
      { predicate: 'rdf:type', value: 'hdt:HC1' },
      {
        predicate: 'dc:source',
        value: typeof metadata?.sourceUri === 'string' ? metadata.sourceUri : 'WIKIDATA_PLACEHOLDER',
      },
    ],
    notes: ['Wikidata mapping placeholder.'],
  }),
};

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