import { describe, expect, it } from 'vitest';
import {
  AatVocabularyProvider,
  buildAatSearchQuery,
} from './aat-provider.js';
import type { SparqlBinding, SparqlClient } from '../sparql-client.js';
import { VocabularyInputError } from '../types.js';

class FakeSparqlClient implements SparqlClient {
  readonly queries: string[] = [];

  constructor(private readonly responses: SparqlBinding[][]) {}

  async query(sparql: string): Promise<SparqlBinding[]> {
    this.queries.push(sparql);
    return this.responses.shift() ?? [];
  }
}

function literal(value: string, language = 'en') {
  return { type: 'literal', value, 'xml:lang': language };
}

function uri(value: string) {
  return { type: 'uri', value };
}

describe('AatVocabularyProvider', () => {
  it('normalizes IDs, CURIEs, and HTTPS Getty URLs to the canonical HTTP URI', () => {
    const provider = new AatVocabularyProvider(new FakeSparqlClient([]));
    const canonical = 'http://vocab.getty.edu/aat/300015050';

    expect(provider.normalizeUri('300015050')).toBe(canonical);
    expect(provider.normalizeUri('aat:300015050')).toBe(canonical);
    expect(provider.normalizeUri('https://vocab.getty.edu/aat/300015050')).toBe(canonical);
    expect(() => provider.normalizeUri('https://example.org/300015050')).toThrow(VocabularyInputError);
  });

  it('builds selective prefix queries that include Unicode safely', () => {
    const query = buildAatSearchQuery('façade detail', 'fr', 10);

    expect(query).toContain('luc:term "façade* AND detail*"');
    expect(query).toContain('(xl:prefLabel|xl:altLabel)');
    expect(query).toContain('LIMIT 40');
    expect(query).toContain('langMatches(lang(?preferred), "fr")');
  });

  it('normalizes exact and partial search rows and disambiguation context', async () => {
    const client = new FakeSparqlClient([[
      {
        subject: uri('http://vocab.getty.edu/aat/300015050'),
        preferred: literal('oil paint (paint)'),
        matched: literal('oil paint (paint)'),
        parents: literal('<paint by composition or origin>, Materials Facet', ''),
      },
      {
        subject: uri('http://vocab.getty.edu/aat/300178684'),
        preferred: literal('oil painting (technique)'),
        matched: literal('oil painting (technique)'),
        parents: literal('<painting techniques by medium>, Activities Facet', ''),
      },
    ]]);
    const provider = new AatVocabularyProvider(client);

    const results = await provider.search('oil paint', { language: 'en', limit: 10 });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      uri: 'http://vocab.getty.edu/aat/300015050',
      preferredLabel: 'oil paint (paint)',
      qualifier: 'paint',
      broaderLabel: 'paint by composition or origin',
      vocabulary: 'AAT',
    });
  });

  it('returns no results for an empty remote result set', async () => {
    const provider = new AatVocabularyProvider(new FakeSparqlClient([[]]));
    await expect(provider.search('nonexistent term')).resolves.toEqual([]);
  });

  it('prefers the requested language, retains an alternative match, and removes duplicates', async () => {
    const subject = uri('http://vocab.getty.edu/aat/300015050');
    const client = new FakeSparqlClient([[
      { subject, preferred: literal('oil paint (paint)', 'en'), matched: literal('vernice a olio', 'it') },
      { subject, preferred: literal('pittura a olio', 'it'), matched: literal('pittura ad olio', 'it') },
      { subject, preferred: literal('pittura a olio', 'it'), matched: literal('pittura ad olio', 'it') },
    ]]);
    const provider = new AatVocabularyProvider(client);

    const results = await provider.search('pittura', { language: 'it' });

    expect(results).toHaveLength(1);
    expect(results[0].preferredLabel).toBe('pittura a olio');
    expect(results[0].language).toBe('it');
    expect(results[0].alternativeLabels).toEqual(['vernice a olio', 'pittura ad olio']);
    expect(results[0].matchedLabel).toBe('vernice a olio');
  });

  it('loads richer concept metadata with language fallback, broader concepts, and scope notes', async () => {
    const client = new FakeSparqlClient([[
      { kind: literal('preferred', ''), value: literal('oil paint (paint)', 'en') },
      { kind: literal('alternative', ''), value: literal('oil paints', 'en') },
      { kind: literal('scopeNote', ''), value: literal('Paint made with a drying oil.', 'en') },
      {
        kind: literal('broader', ''),
        value: literal('paint by composition or origin', 'en'),
        related: uri('http://vocab.getty.edu/aat/300015030'),
      },
    ]]);
    const provider = new AatVocabularyProvider(client);

    const concept = await provider.getConcept('300015050', { language: 'it' });

    expect(concept).toMatchObject({
      uri: 'http://vocab.getty.edu/aat/300015050',
      id: '300015050',
      preferredLabel: 'oil paint (paint)',
      language: 'en',
      alternativeLabels: ['oil paints'],
      scopeNote: 'Paint made with a drying oil.',
      broader: [{
        uri: 'http://vocab.getty.edu/aat/300015030',
        preferredLabel: 'paint by composition or origin',
      }],
    });
  });

  it('rejects too-short searches before contacting Getty', async () => {
    const client = new FakeSparqlClient([]);
    const provider = new AatVocabularyProvider(client);

    await expect(provider.search('x')).rejects.toThrow('at least 2');
    expect(client.queries).toHaveLength(0);
  });
});
