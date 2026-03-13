import * as N3 from 'n3';
import type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';

export interface FileFormState {
  file: File | null;
  dublinCore: Record<string, unknown> | null;
  sourceRecord: Record<string, unknown> | null;
  parseError: string | null;
  parsing: boolean;
}

function extractDublinCoreFromQuads(quads: N3.Quad[]): Record<string, unknown> {
  const getValue = (term: N3.Term | null): string => {
    if (!term) return '';
    return term.value;
  };

  const dcNamespace = 'http://purl.org/dc/elements/1.1/';
  const foafNamespace = 'http://xmlns.com/foaf/0.1/';
  const dublinCore: Record<string, unknown> = {};
  const creatorNodes = new Set<string>();

  for (const quad of quads) {
    const p = quad.predicate.value;
    if (p === dcNamespace + 'title') {
      dublinCore.title = getValue(quad.object);
    } else if (p === dcNamespace + 'creator') {
      if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
        creatorNodes.add(quad.object.value);
      } else {
        dublinCore.creator = getValue(quad.object);
      }
    } else if (p === dcNamespace + 'date') {
      dublinCore.date = getValue(quad.object);
    } else if (p === dcNamespace + 'description') {
      dublinCore.description = getValue(quad.object);
    } else if (p === dcNamespace + 'coverage') {
      dublinCore.coverage = getValue(quad.object);
    } else if (p === dcNamespace + 'rights') {
      dublinCore.rights = getValue(quad.object);
    } else if (p === dcNamespace + 'identifier') {
      dublinCore.identifier = getValue(quad.object);
    } else if (p === dcNamespace + 'subject') {
      dublinCore.subject = getValue(quad.object);
    } else if (p === dcNamespace + 'type') {
      dublinCore.type = getValue(quad.object);
    } else if (p === dcNamespace + 'language') {
      dublinCore.language = getValue(quad.object);
    } else if (p === dcNamespace + 'source') {
      dublinCore.source = getValue(quad.object);
    }
  }

  if (creatorNodes.size > 0 && !dublinCore.creator) {
    for (const quad of quads) {
      if (creatorNodes.has(quad.subject.value) && quad.predicate.value === foafNamespace + 'name') {
        dublinCore.creator = getValue(quad.object);
        break;
      }
    }
  }

  return dublinCore;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => asText(v)).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    if (typeof r['@value'] === 'string') return r['@value'];
    if (typeof r.value === 'string') return r.value;
  }
  return '';
}

function FileImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<FileFormState>) {
  return (
    <div>
      <div className="mb-3">
        <label htmlFor="hdtRdfFile" className="form-label">RDF file</label>
        <input
          type="file"
          id="hdtRdfFile"
          accept=".json,.jsonld,.rdf,.ttl,.txt,application/json,application/ld+json"
          className="form-control"
          disabled={disabled || state.parsing}
          onChange={async (e) => {
            const file = e.target.files?.[0] ?? null;
            if (!file) return;
            onChange({ ...state, file, parsing: true, parseError: null, dublinCore: null, sourceRecord: null });
            try {
              const text = await file.text();
              const parser = new N3.Parser();
              const quads: N3.Quad[] = [];
              await new Promise<void>((resolve, reject) => {
                parser.parse(text, (error, quad) => {
                  if (error) { reject(error); return; }
                  if (quad) quads.push(quad);
                  else resolve();
                });
              });
              if (quads.length === 0) {
                onChange({ ...state, file, parsing: false, parseError: 'No RDF data found in file. Please check the format.', dublinCore: null, sourceRecord: null });
                return;
              }
              const dublinCore = extractDublinCoreFromQuads(quads);
              const sourceRecord: Record<string, unknown> = {
                importedFrom: 'rdf-file',
                fileName: file.name,
                quadCount: quads.length,
                importedAt: new Date().toISOString(),
              };
              onChange({ ...state, file, parsing: false, parseError: null, dublinCore, sourceRecord });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              onChange({ ...state, file, parsing: false, parseError: msg, dublinCore: null, sourceRecord: null });
            }
          }}
        />
        <div className="form-text">Supported: JSON-LD, Turtle, RDF/XML, N-Triples</div>
      </div>
      {state.parsing && (
        <div className="text-muted small">⏳ Parsing file…</div>
      )}
      {state.parseError && (
        <div className="alert alert-danger small py-2">{state.parseError}</div>
      )}
      {state.dublinCore && !state.parseError && (
        <div className="alert alert-success small py-2">
          ✅ File parsed ({(state.sourceRecord?.quadCount as number) ?? 0} quads).
          {(state.dublinCore.title as string | undefined) && (
            <> Title: <strong>{String(state.dublinCore.title)}</strong></>
          )}
        </div>
      )}
    </div>
  );
}

function FileMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  if (!metadata) {
    return <div className="text-muted">No imported metadata available.</div>;
  }
  const dc = metadata.dublinCore as Record<string, unknown> | undefined;
  const sr = metadata.sourceRecord as Record<string, unknown> | undefined;
  const field = (key: string) => asText(dc?.[key]) || '-';

  return (
    <div>
      <h6 className="mb-2">Dublin Core (Read-only)</h6>
      <div className="table-responsive mb-3">
        <table className="table table-sm align-middle">
          <tbody>
            <tr><th>Title</th><td>{field('title')}</td></tr>
            <tr><th>Description</th><td>{field('description')}</td></tr>
            <tr><th>Creator</th><td>{field('creator')}</td></tr>
            <tr><th>Subject</th><td>{field('subject')}</td></tr>
            <tr><th>Date</th><td>{field('date')}</td></tr>
            <tr><th>Type</th><td>{field('type')}</td></tr>
            <tr><th>Identifier</th><td>{field('identifier')}</td></tr>
            <tr><th>Coverage</th><td>{field('coverage')}</td></tr>
            <tr><th>Rights</th><td>{field('rights')}</td></tr>
            <tr><th>Source</th><td>{field('source')}</td></tr>
          </tbody>
        </table>
      </div>
      <h6 className="mb-2">Import Record</h6>
      <ul className="list-group list-group-flush border rounded">
        <li className="list-group-item d-flex justify-content-between">
          <span>File name</span>
          <span>{asText(sr?.fileName) || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Quad count</span>
          <span>{asText(sr?.quadCount) || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Imported At</span>
          <span>{asText(sr?.importedAt) || '-'}</span>
        </li>
      </ul>
    </div>
  );
}

function mapFileToHdtOntology(metadata: PhysicalObjectMetadataRecord | null): OntologyMappingResult {
  const triples: OntologyMappingResult['triples'] = [];
  const dc = metadata?.dublinCore as Record<string, unknown> | undefined;
  const push = (predicate: string, key: string) => {
    const v = asText(dc?.[key]);
    if (v) triples.push({ predicate, value: v });
  };

  triples.push({ predicate: 'rdf:type', value: 'hdt:HC1' });
  push('dc:title', 'title');
  push('dc:description', 'description');
  push('dc:creator', 'creator');
  push('dc:subject', 'subject');
  push('dc:date', 'date');
  push('dc:type', 'type');
  push('dc:identifier', 'identifier');
  push('dc:coverage', 'coverage');
  push('dc:rights', 'rights');
  push('dc:source', 'source');

  return {
    classId: 'HC1',
    sourceType: 'file',
    triples,
    notes: ['Mapping is generated from Dublin Core fields extracted from the uploaded RDF file.'],
  };
}

export const fileSourceAdapter: PhysicalObjectSourceAdapter<FileFormState> = {
  sourceType: 'file',
  label: 'File (RDF - HDT Ontology)',
  description: 'Upload an RDF file containing Dublin Core metadata aligned with the HDT ontology.',
  status: 'available',
  createInitialState: () => ({
    file: null,
    dublinCore: null,
    sourceRecord: null,
    parseError: null,
    parsing: false,
  }),
  ImportForm: FileImportForm,
  buildImportRequest: (projectId: string, state: FileFormState) => {
    if (!state.dublinCore || state.parseError) {
      throw new Error('No parsed RDF data available. Please select a valid RDF file first.');
    }
    const sourceUri =
      typeof state.dublinCore.source === 'string' && state.dublinCore.source.trim().length > 0
        ? state.dublinCore.source.trim()
        : `urn:ocra:project:${projectId}:file-import:${state.file?.name ?? 'unknown'}`;
    return {
      sourceType: 'other',
      sourceUri,
      payload: {
        dublinCore: state.dublinCore,
        sourceRecord: state.sourceRecord ?? {},
      },
    };
  },
  MetadataView: FileMetadataView,
  mapToHdtOntology: mapFileToHdtOntology,
};
