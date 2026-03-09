import * as N3 from 'n3';
import type { DublinCoreMetadata } from '../../types/index.js';
import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

const DEFAULT_ECHOES_ENDPOINT =
  'https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resolveEchoesRequest(payload: unknown): {
  endpoint: string;
  queryPayload: Record<string, unknown>;
} {
  const payloadRecord = isRecord(payload) ? payload : {};
  const endpoint =
    typeof payloadRecord.endpoint === 'string' && payloadRecord.endpoint.trim()
      ? payloadRecord.endpoint.trim()
      : DEFAULT_ECHOES_ENDPOINT;

  let queryPayload: Record<string, unknown> | null = null;

  if (isRecord(payloadRecord.queryPayload)) {
    queryPayload = payloadRecord.queryPayload;
  } else if (isRecord(payloadRecord.payload)) {
    queryPayload = payloadRecord.payload;
  } else if (
    typeof payloadRecord.query === 'string' &&
    Array.isArray(payloadRecord.tripleStoreIds) &&
    typeof payloadRecord.executorTripleStoreId === 'string'
  ) {
    queryPayload = payloadRecord;
  }

  if (!queryPayload) {
    throw new Error(
      'ECHOES import payload must include queryPayload (or payload) with query, tripleStoreIds, and executorTripleStoreId'
    );
  }

  return { endpoint, queryPayload };
}

function sparqlJsonToQuads(sparqlJson: any): N3.Quad[] {
  const { DataFactory } = N3;
  const quads: N3.Quad[] = [];

  if (!sparqlJson?.results?.bindings) {
    throw new Error('Invalid SPARQL JSON format');
  }

  for (const binding of sparqlJson.results.bindings) {
    const s = binding.s || binding.subject;
    const p = binding.p || binding.predicate;
    const o = binding.o || binding.object;

    if (!s || !p || !o) continue;

    let subject: N3.Quad_Subject;
    if (s.type === 'uri' || s.type === 'iri') {
      subject = DataFactory.namedNode(s.value);
    } else if (s.type === 'bnode') {
      subject = DataFactory.blankNode(s.value);
    } else {
      continue;
    }

    if (p.type !== 'uri' && p.type !== 'iri') continue;
    const predicate = DataFactory.namedNode(p.value);

    let object: N3.Quad_Object;
    if (o.type === 'uri' || o.type === 'iri') {
      object = DataFactory.namedNode(o.value);
    } else if (o.type === 'bnode') {
      object = DataFactory.blankNode(o.value);
    } else if (o.type === 'literal' || o.type === 'typed-literal') {
      if (o.datatype) {
        object = DataFactory.literal(o.value, DataFactory.namedNode(o.datatype));
      } else if (o['xml:lang'] || o.lang) {
        object = DataFactory.literal(o.value, o['xml:lang'] || o.lang);
      } else {
        object = DataFactory.literal(o.value);
      }
    } else {
      continue;
    }

    quads.push(DataFactory.quad(subject, predicate, object));
  }

  return quads;
}

function extractDublinCoreFromQuads(quads: N3.Quad[]): Partial<DublinCoreMetadata> {
  const getValue = (term: N3.Term | null): string => {
    if (!term) return '';
    return term.value;
  };

  const dcNamespace = 'http://purl.org/dc/elements/1.1/';
  const foafNamespace = 'http://xmlns.com/foaf/0.1/';
  const dublinCore: Partial<DublinCoreMetadata> = {};
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

export class EchoesPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'echoes' as const;

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    const { endpoint, queryPayload } = resolveEchoesRequest(context.payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(queryPayload)
    });

    if (!response.ok) {
      throw new Error(`ECHOES endpoint returned ${response.status}: ${response.statusText}`);
    }

    let sparqlJson = await response.json();
    if (sparqlJson?.succeed && sparqlJson?.results) {
      sparqlJson = sparqlJson.results;
    }

    const quads = sparqlJsonToQuads(sparqlJson);
    if (quads.length === 0) {
      throw new Error('No RDF triples found in ECHOES response');
    }

    const dublinCore = extractDublinCoreFromQuads(quads);

    return {
      dublinCore,
      sourceRecord: {
        endpoint,
        tripleCount: quads.length,
        importedAt: new Date().toISOString(),
        sourceUri: context.sourceUri
      }
    };
  }
}
