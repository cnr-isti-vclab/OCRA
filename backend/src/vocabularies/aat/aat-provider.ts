import type {
  ExternalVocabularyConcept,
  VocabularyConceptRef,
  VocabularyProviderSummary,
  VocabularySearchResult,
} from 'shared/external-vocabulary';
import type { SparqlBinding, SparqlClient, SparqlValue } from '../sparql-client.js';
import {
  VocabularyConceptNotFoundError,
  VocabularyInputError,
  type VocabularyConceptOptions,
  type VocabularyProvider,
  type VocabularySearchOptions,
} from '../types.js';

const AAT_URI_PREFIX = 'http://vocab.getty.edu/aat/';
const AAT_ID_PATTERN = /^300\d{6}$/;
const LANGUAGE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const PREFIXES = `PREFIX aat: <http://vocab.getty.edu/aat/>
PREFIX gvp: <http://vocab.getty.edu/ontology#>
PREFIX luc: <http://www.ontotext.com/owlim/lucene#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xl: <http://www.w3.org/2008/05/skos-xl#>`;

export const AAT_PROVIDER_METADATA: VocabularyProviderSummary = {
  id: 'aat',
  name: 'Getty Art & Architecture Thesaurus (AAT)',
  description: 'Authoritative concepts for art, architecture and cultural heritage.',
  canonicalUriPrefix: AAT_URI_PREFIX,
};

function bindingValue(binding: SparqlBinding, key: string): string | undefined {
  const value = binding[key]?.value?.trim();
  return value || undefined;
}

function normalizeLanguage(value: string | undefined): string {
  const language = (value || 'en').trim().toLowerCase();
  if (!LANGUAGE_PATTERN.test(language)) {
    throw new VocabularyInputError('lang must be a valid BCP 47 language tag');
  }
  return language;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1) {
    throw new VocabularyInputError('limit must be a positive integer');
  }
  return Math.min(value, MAX_LIMIT);
}

function languageRank(candidate: string | undefined, requested: string): number {
  if (candidate === requested) return 0;
  if (candidate?.split('-')[0] === requested.split('-')[0]) return 1;
  if (candidate === 'en') return 2;
  if (candidate?.startsWith('en-')) return 3;
  return 4;
}

function chooseLocalized(values: SparqlValue[], requested: string): SparqlValue | undefined {
  return [...values].sort((left, right) =>
    languageRank(left['xml:lang']?.toLowerCase(), requested)
      - languageRank(right['xml:lang']?.toLowerCase(), requested))[0];
}

function escapeSparqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ');
}

function buildLuceneExpression(query: string): string {
  return normalizeSearchText(query)
    .split(' ')
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(' AND ');
}

function languageFilter(variable: string, language: string): string {
  const base = language.split('-')[0];
  return `(langMatches(lang(${variable}), "${escapeSparqlString(language)}") || langMatches(lang(${variable}), "${escapeSparqlString(base)}") || langMatches(lang(${variable}), "en"))`;
}

export function buildAatSearchQuery(query: string, language: string, limit: number): string {
  const luceneExpression = escapeSparqlString(buildLuceneExpression(query));
  return `${PREFIXES}
SELECT ?subject ?matched ?preferred ?parents WHERE {
  {
    SELECT DISTINCT ?subject ?matched ?parents WHERE {
      ?termNode luc:term "${luceneExpression}" ;
        a xl:Label ;
        xl:literalForm ?matched .
      ?subject (xl:prefLabel|xl:altLabel) ?termNode ;
        skos:inScheme aat: .
      OPTIONAL { ?subject gvp:parentStringAbbrev ?parents }
    }
    LIMIT ${Math.min(limit * 4, 200)}
  }
  OPTIONAL {
    ?subject xl:prefLabel/xl:literalForm ?preferred .
    FILTER ${languageFilter('?preferred', language)}
  }
}`;
}

export function buildAatConceptQuery(uri: string, language: string): string {
  return `${PREFIXES}
SELECT ?kind ?value ?related WHERE {
  VALUES ?subject { <${uri}> }
  ?subject skos:inScheme aat: .
  {
    ?subject xl:prefLabel/xl:literalForm ?value .
    FILTER ${languageFilter('?value', language)}
    BIND("preferred" AS ?kind)
  } UNION {
    ?subject xl:altLabel/xl:literalForm ?value .
    FILTER ${languageFilter('?value', language)}
    BIND("alternative" AS ?kind)
  } UNION {
    ?subject skos:scopeNote/rdf:value ?value .
    FILTER ${languageFilter('?value', language)}
    BIND("scopeNote" AS ?kind)
  } UNION {
    ?subject gvp:broaderPreferred ?related .
    ?related xl:prefLabel/xl:literalForm ?value .
    FILTER ${languageFilter('?value', language)}
    BIND("broader" AS ?kind)
  }
}`;
}

export function buildAatNarrowerQuery(uri: string, language: string): string {
  return `${PREFIXES}
SELECT ?subject ?preferred WHERE {
  ?subject gvp:broaderPreferred <${uri}> ;
    skos:inScheme aat: ;
    xl:prefLabel/xl:literalForm ?preferred .
  FILTER ${languageFilter('?preferred', language)}
}`;
}

function qualifierFromLabel(label: string): string | undefined {
  return label.match(/\(([^()]*)\)\s*$/)?.[1]?.trim() || undefined;
}

function firstHierarchyLabel(hierarchy: string | undefined): string | undefined {
  const first = hierarchy?.split(',')[0]?.trim().replace(/^<|>$/g, '');
  return first || undefined;
}

interface LabelBucket {
  preferred: SparqlValue[];
  matched: SparqlValue[];
  hierarchyContext?: string;
}

function conceptRef(uri: string, label: SparqlValue): VocabularyConceptRef {
  return {
    uri,
    id: uri.slice(AAT_URI_PREFIX.length),
    vocabulary: 'AAT',
    preferredLabel: label.value as string,
    ...(label['xml:lang'] ? { language: label['xml:lang'].toLowerCase() } : {}),
  };
}

export class AatVocabularyProvider implements VocabularyProvider {
  readonly metadata = AAT_PROVIDER_METADATA;

  constructor(private readonly sparqlClient: SparqlClient) {}

  normalizeUri(value: string): string {
    const trimmed = value.trim();
    const id = AAT_ID_PATTERN.test(trimmed)
      ? trimmed
      : trimmed.match(/^(?:aat:|https?:\/\/vocab\.getty\.edu\/aat\/)(300\d{6})\/?$/i)?.[1];
    if (!id) {
      throw new VocabularyInputError('AAT concept must be a Getty AAT URI or a 9-digit ID beginning with 300');
    }
    return `${AAT_URI_PREFIX}${id}`;
  }

  async search(query: string, options: VocabularySearchOptions = {}): Promise<VocabularySearchResult[]> {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 2) {
      throw new VocabularyInputError('q must contain at least 2 letters or digits');
    }
    const language = normalizeLanguage(options.language);
    const limit = normalizeLimit(options.limit);

    if (AAT_ID_PATTERN.test(normalizedQuery) || /^(?:aat:|https?:\/\/vocab\.getty\.edu\/aat\/)/i.test(query.trim())) {
      try {
        const concept = await this.getConcept(query, { language });
        return [{
          uri: concept.uri,
          id: concept.id,
          vocabulary: concept.vocabulary,
          preferredLabel: concept.preferredLabel,
          ...(concept.language ? { language: concept.language } : {}),
          alternativeLabels: concept.alternativeLabels,
          qualifier: qualifierFromLabel(concept.preferredLabel),
          broaderLabel: concept.broader[0]?.preferredLabel,
        }];
      } catch (error) {
        if (error instanceof VocabularyConceptNotFoundError) return [];
        throw error;
      }
    }

    const bindings = await this.sparqlClient.query(buildAatSearchQuery(normalizedQuery, language, limit));
    const byUri = new Map<string, LabelBucket>();

    for (const binding of bindings) {
      const rawUri = bindingValue(binding, 'subject');
      if (!rawUri) continue;
      let uri: string;
      try {
        uri = this.normalizeUri(rawUri);
      } catch {
        continue;
      }
      const bucket = byUri.get(uri) ?? { preferred: [], matched: [] };
      const preferred = binding.preferred;
      const matched = binding.matched;
      if (preferred?.value) bucket.preferred.push(preferred);
      if (matched?.value) bucket.matched.push(matched);
      bucket.hierarchyContext ??= bindingValue(binding, 'parents');
      byUri.set(uri, bucket);
    }

    const foldedQuery = normalizedQuery.toLocaleLowerCase();
    return [...byUri.entries()]
      .flatMap(([uri, bucket]): VocabularySearchResult[] => {
        const preferred = chooseLocalized(bucket.preferred, language)
          ?? chooseLocalized(bucket.matched, language);
        if (!preferred?.value) return [];
        const matched = chooseLocalized(bucket.matched, language);
        const alternatives = [...new Set(bucket.matched
          .map((value) => value.value?.trim())
          .filter((value): value is string => !!value && value !== preferred.value))];
        return [{
          ...conceptRef(uri, preferred),
          ...(alternatives.length ? { alternativeLabels: alternatives } : {}),
          ...(matched?.value && matched.value !== preferred.value ? { matchedLabel: matched.value } : {}),
          ...(qualifierFromLabel(preferred.value) ? { qualifier: qualifierFromLabel(preferred.value) } : {}),
          ...(firstHierarchyLabel(bucket.hierarchyContext) ? {
            broaderLabel: firstHierarchyLabel(bucket.hierarchyContext),
          } : {}),
          ...(bucket.hierarchyContext ? { hierarchyContext: bucket.hierarchyContext } : {}),
        }];
      })
      .sort((left, right) => {
        const leftLabel = left.preferredLabel.toLocaleLowerCase();
        const rightLabel = right.preferredLabel.toLocaleLowerCase();
        const leftRank = leftLabel === foldedQuery ? 0 : leftLabel.startsWith(foldedQuery) ? 1 : 2;
        const rightRank = rightLabel === foldedQuery ? 0 : rightLabel.startsWith(foldedQuery) ? 1 : 2;
        return leftRank - rightRank || leftLabel.localeCompare(rightLabel);
      })
      .slice(0, limit);
  }

  async getConcept(uriOrId: string, options: VocabularyConceptOptions = {}): Promise<ExternalVocabularyConcept> {
    const uri = this.normalizeUri(uriOrId);
    const language = normalizeLanguage(options.language);
    const bindings = await this.sparqlClient.query(buildAatConceptQuery(uri, language));
    const preferred: SparqlValue[] = [];
    const alternative: SparqlValue[] = [];
    const scopeNotes: SparqlValue[] = [];
    const broaderByUri = new Map<string, SparqlValue[]>();

    for (const binding of bindings) {
      const kind = bindingValue(binding, 'kind');
      const value = binding.value;
      if (!kind || !value?.value) continue;
      if (kind === 'preferred') preferred.push(value);
      if (kind === 'alternative') alternative.push(value);
      if (kind === 'scopeNote') scopeNotes.push(value);
      if (kind === 'broader') {
        const related = bindingValue(binding, 'related');
        if (related) broaderByUri.set(related, [...(broaderByUri.get(related) ?? []), value]);
      }
    }

    const selected = chooseLocalized(preferred, language);
    if (!selected?.value) throw new VocabularyConceptNotFoundError(uri);

    const broader = [...broaderByUri.entries()].flatMap(([rawUri, labels]) => {
      try {
        const broaderUri = this.normalizeUri(rawUri);
        const label = chooseLocalized(labels, language);
        return label?.value ? [conceptRef(broaderUri, label)] : [];
      } catch {
        return [];
      }
    });
    const languages = [...new Set([...preferred, ...alternative]
      .map((value) => value['xml:lang']?.toLowerCase())
      .filter((value): value is string => !!value))].sort();
    const alternativeLabels = [...new Set(alternative
      .map((value) => value.value?.trim())
      .filter((value): value is string => !!value && value !== selected.value))];
    const scopeNote = chooseLocalized(scopeNotes, language)?.value;

    return {
      ...conceptRef(uri, selected),
      alternativeLabels,
      broader,
      ...(scopeNote ? { scopeNote } : {}),
      languages,
    };
  }

  async getBroaderConcepts(uri: string, options: VocabularyConceptOptions = {}): Promise<VocabularyConceptRef[]> {
    return (await this.getConcept(uri, options)).broader;
  }

  async getNarrowerConcepts(uriOrId: string, options: VocabularyConceptOptions = {}): Promise<VocabularyConceptRef[]> {
    const uri = this.normalizeUri(uriOrId);
    const language = normalizeLanguage(options.language);
    const bindings = await this.sparqlClient.query(buildAatNarrowerQuery(uri, language));
    const labelsByUri = new Map<string, SparqlValue[]>();

    for (const binding of bindings) {
      const rawUri = bindingValue(binding, 'subject');
      const label = binding.preferred;
      if (!rawUri || !label?.value) continue;
      try {
        const childUri = this.normalizeUri(rawUri);
        labelsByUri.set(childUri, [...(labelsByUri.get(childUri) ?? []), label]);
      } catch {
        // Ignore malformed or non-AAT rows from the remote endpoint.
      }
    }

    return [...labelsByUri.entries()].flatMap(([childUri, labels]) => {
      const label = chooseLocalized(labels, language);
      return label?.value ? [conceptRef(childUri, label)] : [];
    });
  }
}
