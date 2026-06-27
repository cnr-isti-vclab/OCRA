const ARCO_SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql';

// Italian stop words to exclude from bif:contains AND chains (they're not indexed)
const STOP_WORDS = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'a', 'ad', 'e', 'ed', 'o',
  'il', 'la', 'lo', 'le', 'i', 'gli', 'l',
  'un', 'una', 'uno',
  'in', 'da', 'su', 'per', 'con', 'tra', 'fra',
  'che', 'si', 'al', 'ai', 'dal', 'dai', 'sul', 'sui',
]);

export interface ArcoSearchResult {
  uri: string;
  title: string | null;
  identifier: string | null;
  creator: string | null;
  date: string | null;
  coverage: string | null;
  depiction: string | null;
}

function getBindingStr(binding: Record<string, { type: string; value: string }>, key: string): string | null {
  return binding[key]?.value?.trim() || null;
}

function labelFromUri(uri: string): string {
  return uri.split('/').pop() || uri;
}

async function runSparql(query: string): Promise<Record<string, { type: string; value: string }>[]> {
  const url = new URL(ARCO_SPARQL_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'application/sparql-results+json');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/sparql-results+json' },
  });

  if (!response.ok) {
    throw new Error(`ArCo SPARQL endpoint returned ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    results: { bindings: Record<string, { type: string; value: string }>[] };
  };

  return json.results.bindings;
}

function bindingToResult(b: Record<string, { type: string; value: string }>): ArcoSearchResult {
  const creator = getBindingStr(b, 'creator');
  return {
    uri: b.subject.value,
    title: getBindingStr(b, 'title') || getBindingStr(b, 'label'),
    identifier: getBindingStr(b, 'identifier'),
    creator: creator && creator.startsWith('http') ? labelFromUri(creator) : creator,
    date: getBindingStr(b, 'date'),
    coverage: getBindingStr(b, 'coverage'),
    depiction: getBindingStr(b, 'depiction'),
  };
}

// Build a bif:contains expression from a free-text query.
// Virtuoso bif:contains uses a full-text index — much faster than CONTAINS(LCASE(...)).
// Multi-word: joins meaningful words with AND so ALL must appear (any order).
function buildBifContains(query: string): string {
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/'/g, '').replace(/[^a-zA-Z0-9àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]/g, ''))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));

  if (words.length === 0) {
    // Fallback: use the whole query as a phrase
    return `'"${query.trim().replace(/'/g, '')}"'`;
  }
  if (words.length === 1) {
    return `'${words[0]}'`;
  }
  return `'${words.join(' AND ')}'`;
}

export const ARCO_PAGE_SIZE = 20;

export async function searchArco(query: string, offset = 0): Promise<ArcoSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Search query is required');
  }

  const isIdentifier = /^\d{6,}$/.test(trimmed);
  const safe = trimmed.replace(/"/g, '');

  const depictionSubquery = `OPTIONAL {
    SELECT ?subject (SAMPLE(?d) AS ?depiction) WHERE {
      ?subject <http://xmlns.com/foaf/0.1/depiction> ?d
    } GROUP BY ?subject
  }`;

  const sparqlQuery = isIdentifier
    ? `PREFIX arco: <https://w3id.org/arco/ontology/arco/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?subject ?title ?label ?identifier ?creator ?date ?coverage ?depiction WHERE {
  OPTIONAL { ?subject dc:title ?title }
  OPTIONAL { ?subject rdfs:label ?label . FILTER(LANG(?label) = "it" || LANG(?label) = "") }
  OPTIONAL { ?subject dc:identifier ?identifier }
  OPTIONAL { ?subject dc:creator ?creator }
  OPTIONAL { ?subject dc:date ?date }
  OPTIONAL { ?subject dc:coverage ?coverage }
  ${depictionSubquery}
  FILTER(STR(?identifier) = "${safe}")
} LIMIT ${ARCO_PAGE_SIZE} OFFSET ${offset}`
    : `PREFIX arco: <https://w3id.org/arco/ontology/arco/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX bif: <http://www.openlinksw.com/schemas/bif#>
SELECT DISTINCT ?subject ?title ?label ?identifier ?creator ?date ?coverage ?depiction WHERE {
  {
    { ?subject a arco:MovableCulturalProperty }
    UNION
    { ?subject a arco:ImmovableCulturalProperty }
    UNION
    { ?subject a arco:ArchaeologicalProperty }
    UNION
    { ?subject a arco:DemoEthnoAnthropologicalHeritage }
  }
  ?subject rdfs:label ?label .
  ?label bif:contains ${buildBifContains(safe)} .
  FILTER(LANG(?label) = "it" || LANG(?label) = "")
  OPTIONAL { ?subject dc:title ?title }
  OPTIONAL { ?subject dc:identifier ?identifier }
  OPTIONAL { ?subject dc:creator ?creator }
  OPTIONAL { ?subject dc:date ?date }
  OPTIONAL { ?subject dc:coverage ?coverage }
  ${depictionSubquery}
} LIMIT ${ARCO_PAGE_SIZE} OFFSET ${offset}`;

  const bindings = await runSparql(sparqlQuery);
  return bindings.map(bindingToResult);
}
