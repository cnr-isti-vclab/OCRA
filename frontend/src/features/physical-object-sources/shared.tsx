import type { OntologyMappingResult, PhysicalObjectMetadataRecord } from './types';
import { ECHOES_HDTO_CURIE_HC1_HERITAGE_ENTITY } from 'shared/echoes-hdto';

// ── Value helpers ──────────────────────────────────────────────────────────────

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => asText(v)).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    if (typeof r['@value'] === 'string') return r['@value'];
    if (typeof r['@id'] === 'string') return r['@id'];
    if (typeof r.value === 'string') return r.value;
  }
  return '';
}

export function getDublinCoreField(metadata: PhysicalObjectMetadataRecord | null, key: string): string {
  return asText((metadata?.dublinCore as Record<string, unknown> | undefined)?.[key]);
}

export function getSourceRecordField(metadata: PhysicalObjectMetadataRecord | null, key: string): string {
  return asText((metadata?.sourceRecord as Record<string, unknown> | undefined)?.[key]);
}

// ── Shared Dublin Core table ───────────────────────────────────────────────────

const DC_FIELDS: [string, string][] = [
  ['Title', 'title'], ['Description', 'description'], ['Creator', 'creator'],
  ['Subject', 'subject'], ['Date', 'date'], ['Type', 'type'],
  ['Identifier', 'identifier'], ['Coverage', 'coverage'],
  ['Rights', 'rights'], ['Source', 'source'], ['Language', 'language'],
];

function DublinCoreTable({ metadata }: { metadata: PhysicalObjectMetadataRecord }) {
  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="text-muted small">Source Type</div>
            <div className="fw-semibold">{asString(metadata.sourceType) || '-'}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="text-muted small">Source URI</div>
            <code className="text-break">{asString(metadata.sourceUri) || '-'}</code>
          </div>
        </div>
      </div>
      <h6 className="mb-2">Dublin Core (Read-only)</h6>
      <div className="table-responsive mb-3">
        <table className="table table-sm align-middle">
          <tbody>
            {DC_FIELDS.map(([label, key]) => {
              const val = getDublinCoreField(metadata, key);
              return val ? <tr key={key}><th>{label}</th><td>{val}</td></tr> : null;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function DefaultMetadataView({
  metadata,
  children,
}: {
  metadata: PhysicalObjectMetadataRecord | null;
  children?: React.ReactNode;
}) {
  if (!metadata) return <div className="text-muted">No imported metadata available.</div>;
  return (
    <div>
      <DublinCoreTable metadata={metadata} />
      {children}
    </div>
  );
}

// ── Shared mapToHdtOntology ────────────────────────────────────────────────────

const DC_ONTOLOGY_FIELDS: [string, string][] = [
  ['dc:title', 'title'], ['dc:description', 'description'], ['dc:creator', 'creator'],
  ['dc:subject', 'subject'], ['dc:date', 'date'], ['dc:type', 'type'],
  ['dc:identifier', 'identifier'], ['dc:coverage', 'coverage'],
  ['dc:rights', 'rights'], ['dc:language', 'language'],
];

export function defaultMapToHdtOntology(
  metadata: PhysicalObjectMetadataRecord | null,
  sourceType: string,
  notes: string[]
): OntologyMappingResult {
  const triples: OntologyMappingResult['triples'] = [{ predicate: 'rdf:type', value: ECHOES_HDTO_CURIE_HC1_HERITAGE_ENTITY }];

  for (const [predicate, key] of DC_ONTOLOGY_FIELDS) {
    const value = getDublinCoreField(metadata, key);
    if (value) triples.push({ predicate, value });
  }

  const source = getDublinCoreField(metadata, 'source') || asString(metadata?.sourceUri);
  if (source) triples.push({ predicate: 'dc:source', value: source });

  return { classId: 'HC1_Heritage_Entity', sourceType, triples, notes };
}
