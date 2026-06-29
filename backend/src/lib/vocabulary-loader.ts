/**
 * @spike feature/vocabulary-color-spike
 *
 * Loads the OCRA TTL vocabulary file at startup and builds an in-memory map of
 * concepts with their display colors and labels.
 *
 * Remove this module (and its usages) once vocabulary data is managed through
 * the database.
 */

import * as N3 from 'n3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDF_PROPERTY = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property';
const RDFS_SUB_PROPERTY_OF = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
const SKOS_CONCEPT = 'http://www.w3.org/2004/02/skos/core#Concept';
const SKOS_CONCEPT_SCHEME = 'http://www.w3.org/2004/02/skos/core#ConceptScheme';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const SKOS_SCOPE_NOTE = 'http://www.w3.org/2004/02/skos/core#scopeNote';
const SKOS_BROADER = 'http://www.w3.org/2004/02/skos/core#broader';
const SKOS_IN_SCHEME = 'http://www.w3.org/2004/02/skos/core#inScheme';
const OCRA_DEFAULT_COLOR = 'https://ocra.example.org/ontology/defaultColor';

export type VocabularyLocalizedValues = Record<string, string>;

export interface VocabularyConcept {
  id: string;
  curie: string;
  lemma: string;
  schemeId: string;
  prefLabels: VocabularyLocalizedValues;
  scopeNotes: VocabularyLocalizedValues;
  color: string;
  broader: string | null;
}

export interface VocabularyProperty {
  id: string;
  curie: string;
  lemma: string;
  schemeId: string;
  prefLabels: VocabularyLocalizedValues;
  scopeNotes: VocabularyLocalizedValues;
  color: string;
  subPropertyOf: string | null;
}

export interface VocabularyScheme {
  id: string;
  curie: string;
  lemma: string;
  prefLabels: VocabularyLocalizedValues;
  scopeNotes: VocabularyLocalizedValues;
}

export interface VocabularyData {
  schemes: VocabularyScheme[];
  concepts: VocabularyConcept[];
  properties: VocabularyProperty[];
}

let cache: VocabularyData | null = null;

const KNOWN_PREFIXES = [
  ['https://ocra.example.org/vocabulary/', 'ocra-voc'],
  ['https://ocra.example.org/ontology/', 'ocra'],
  ['http://vocab.getty.edu/aat/', 'aat'],
  ['http://www.wikidata.org/entity/', 'wd'],
  ['http://purl.org/dc/terms/', 'dcterms'],
  ['http://www.w3.org/2000/01/rdf-schema#', 'rdfs'],
  ['http://www.w3.org/2004/02/skos/core#', 'skos'],
  ['http://www.w3.org/2001/XMLSchema#', 'xsd'],
] as const;

function toCurie(uri: string): string {
  for (const [base, prefix] of KNOWN_PREFIXES) {
    if (uri.startsWith(base)) {
      return `${prefix}:${uri.slice(base.length)}`;
    }
  }
  return uri;
}

function getTtlPath(): string {
  return (
    process.env.VOCAB_TTL_PATH ??
    resolve(process.cwd(), '../media/RDF/ocra-vocabulary-extended.ttl')
  );
}

function emptyResult(): VocabularyData {
  return {
    schemes: [],
    concepts: [],
    properties: [],
  };
}

function getLemma(curie: string): string {
  const parts = curie.split(/[:/#]/);
  return parts[parts.length - 1] || curie;
}

function getDefaultLocalizedLabels(curie: string): VocabularyLocalizedValues {
  const lemma = getLemma(curie);
  return {
    en: lemma,
  };
}

function upsertLocalizedValue(
  bucket: VocabularyLocalizedValues,
  lang: string,
  value: string,
): void {
  const key = lang || 'und';
  if (!bucket[key]) {
    bucket[key] = value;
  }
}

/**
 * Loads and parses the TTL vocabulary file, returning scheme metadata and all
 * skos:Concept entries with their labels and defaultColor.
 *
 * Results are memoised for the process lifetime.
 */
export function loadVocabularyData(): VocabularyData {
  if (cache) return cache;

  const ttlPath = getTtlPath();
  let content: string;
  try {
    content = readFileSync(ttlPath, 'utf-8');
  } catch (err) {
    console.warn(`[vocabulary-loader] Cannot read TTL at ${ttlPath}:`, err);
    cache = emptyResult();
    return cache;
  }

  const { DataFactory } = N3;
  let quads: N3.Quad[];
  try {
    quads = new N3.Parser().parse(content);
  } catch (err) {
    console.warn('[vocabulary-loader] Cannot parse TTL:', err);
    cache = emptyResult();
    return cache;
  }

  // -- Pass 1: collect per-subject data buckets --

  interface Bucket {
    types: Set<string>;
    prefLabels: VocabularyLocalizedValues;
    scopeNotes: VocabularyLocalizedValues;
    color: string;
    broader: string | null;
    subPropertyOf: string | null;
    inScheme: string | null;
  }

  const subjects = new Map<string, Bucket>();

  const getOrCreate = (uri: string): Bucket => {
    let b = subjects.get(uri);
    if (!b) {
      b = {
        types: new Set(),
        prefLabels: {},
        scopeNotes: {},
        color: '',
        broader: null,
        subPropertyOf: null,
        inScheme: null,
      };
      subjects.set(uri, b);
    }
    return b;
  };

  for (const quad of quads) {
    const s = quad.subject.value;
    const p = quad.predicate.value;
    const o = quad.object;

    const bucket = getOrCreate(s);

    if (p === RDF_TYPE && o.termType === 'NamedNode') {
      bucket.types.add(o.value);
      continue;
    }

    if (p === SKOS_PREF_LABEL && o.termType === 'Literal') {
      const lang = (o as N3.Literal).language;
      upsertLocalizedValue(bucket.prefLabels, lang, o.value);
      continue;
    }

    if (p === SKOS_SCOPE_NOTE && o.termType === 'Literal') {
      const lang = (o as N3.Literal).language;
      upsertLocalizedValue(bucket.scopeNotes, lang, o.value);
      continue;
    }

    if (p === OCRA_DEFAULT_COLOR && o.termType === 'Literal') {
      if (!bucket.color) bucket.color = o.value;
      continue;
    }

    if (p === SKOS_BROADER && o.termType === 'NamedNode') {
      bucket.broader = toCurie(o.value);
      continue;
    }

    if (p === SKOS_IN_SCHEME && o.termType === 'NamedNode') {
      bucket.inScheme = toCurie(o.value);
      continue;
    }

    if (p === RDFS_SUB_PROPERTY_OF && o.termType === 'NamedNode') {
      bucket.subPropertyOf = toCurie(o.value);
      continue;
    }
  }

  // -- Pass 2: extract scheme and concepts --

  const schemes: VocabularyScheme[] = [];
  const concepts: VocabularyConcept[] = [];
  const properties: VocabularyProperty[] = [];

  for (const [uri, b] of subjects) {
    const curie = toCurie(uri);
    const lemma = getLemma(curie);
    if (b.types.has(SKOS_CONCEPT_SCHEME)) {
      schemes.push({
        id: curie,
        curie,
        lemma,
        prefLabels: Object.keys(b.prefLabels).length > 0
          ? b.prefLabels
          : {
              en: 'OCRA Vocabulary',
              it: 'Vocabolario OCRA',
            },
        scopeNotes: b.scopeNotes,
      });
    }

    if (b.types.has(SKOS_CONCEPT)) {
      concepts.push({
        id: curie,
        curie,
        lemma,
        schemeId: b.inScheme ?? '',
        prefLabels: Object.keys(b.prefLabels).length > 0
          ? b.prefLabels
          : getDefaultLocalizedLabels(curie),
        scopeNotes: b.scopeNotes,
        color: b.color || '#808080',
        broader: b.broader,
      });
    }

    if (b.types.has(RDF_PROPERTY)) {
      properties.push({
        id: curie,
        curie,
        lemma,
        schemeId: b.inScheme ?? '',
        prefLabels: Object.keys(b.prefLabels).length > 0
          ? b.prefLabels
          : getDefaultLocalizedLabels(curie),
        scopeNotes: b.scopeNotes,
        color: b.color || '#808080',
        subPropertyOf: b.subPropertyOf,
      });
    }
  }

  // Sort concepts alphabetically for stable ordering
  const labelOrder = (left: { prefLabels: VocabularyLocalizedValues; lemma: string }, right: { prefLabels: VocabularyLocalizedValues; lemma: string }) =>
    (left.prefLabels.en || left.prefLabels.it || left.lemma)
      .localeCompare(right.prefLabels.en || right.prefLabels.it || right.lemma);

  schemes.sort(labelOrder);
  concepts.sort(labelOrder);
  properties.sort(labelOrder);

  const primarySchemeId = schemes[0]?.id ?? '';
  if (primarySchemeId) {
    for (const concept of concepts) {
      if (!concept.schemeId) {
        concept.schemeId = primarySchemeId;
      }
    }
    for (const property of properties) {
      if (!property.schemeId) {
        property.schemeId = primarySchemeId;
      }
    }
  }

  cache = { schemes, concepts, properties };
  return cache;
}

/** Returns the defaultColor for a concept CURIE, or null if not found. */
export function getConceptColor(curie: string): string | null {
  return loadVocabularyData().concepts.find((c) => c.curie === curie)?.color ?? null;
}
