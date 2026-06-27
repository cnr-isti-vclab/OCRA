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
  coverage: string | null;
}

export interface ArcoRecordDetail extends ArcoSearchResult {
  creator: string | null;
  date: string | null;
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

function bindingToSearchResult(b: Record<string, { type: string; value: string }>): ArcoSearchResult {
  return {
    uri: b.subject.value,
    title: getBindingStr(b, 'title') || getBindingStr(b, 'label'),
    identifier: getBindingStr(b, 'identifier'),
    coverage: getBindingStr(b, 'coverage'),
  };
}

function bindingToRecordDetail(b: Record<string, { type: string; value: string }>): ArcoRecordDetail {
  const creator = getBindingStr(b, 'creator');
  return {
    uri: b.subject.value,
    title: getBindingStr(b, 'title') || getBindingStr(b, 'label'),
    identifier: getBindingStr(b, 'identifier'),
    coverage: getBindingStr(b, 'coverage'),
    creator: creator && creator.startsWith('http') ? labelFromUri(creator) : creator,
    date: getBindingStr(b, 'date'),
    depiction: getBindingStr(b, 'depiction'),
  };
}

function normalizeSearchWords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/'/g, '').replace(/[^a-zA-Z0-9àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]/g, ''))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
}

function escapeSparqlStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface ArcoLabelSearchClause {
  bifContains: string | null;
  trailingContainsNeedle: string | null;
}

function buildSingleArcoLabelSearchClause(query: string): ArcoLabelSearchClause {
  const words = normalizeSearchWords(query);

  if (words.length === 0) {
    const fallbackNeedle = query.trim().replace(/'/g, '').toLowerCase();
    return {
      bifContains: null,
      trailingContainsNeedle: fallbackNeedle.length > 0 ? fallbackNeedle : null,
    };
  }

  if (words.length === 1) {
    return {
      bifContains: null,
      trailingContainsNeedle: words[0].toLowerCase(),
    };
  }

  return {
    bifContains: `'${words.slice(0, -1).join(' AND ')}'`,
    trailingContainsNeedle: words[words.length - 1].toLowerCase(),
  };
}

// Build the text-search constraints used against rdfs:label.
// A comma creates explicit AND groups for the user:
// "allegoria della, galassi" means the label must match both fragments.
// Within each group, we keep Virtuoso bif:contains for the leading complete terms
// because it is indexed, then apply a plain substring filter to the last significant
// token so truncated endings like "disperazion" still match "disperazione".
export function buildArcoLabelSearchClauses(query: string): ArcoLabelSearchClause[] {
  const groups = query
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (groups.length === 0) {
    return [buildSingleArcoLabelSearchClause(query)];
  }

  return groups.map((group) => buildSingleArcoLabelSearchClause(group));
}

export function buildArcoIndexedBifContains(query: string): string | null {
  const groups = query
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const sourceGroups = groups.length > 0 ? groups : [query];
  const words = sourceGroups.flatMap((group) => normalizeSearchWords(group));

  if (words.length === 0) {
    return null;
  }

  return `'${words.join(' AND ')}'`;
}

export const ARCO_PAGE_SIZE = 20;

function buildLabelSearchFilters(
  clauses: Array<{ bifContains: string | null; trailingContainsNeedle?: string | null; rawContainsNeedle?: string | null }>
): string {
  return clauses.flatMap((clause) => [
    clause.bifContains
      ? `  ?label bif:contains ${clause.bifContains} .`
      : null,
    clause.trailingContainsNeedle
      ? `  FILTER(CONTAINS(LCASE(STR(?label)), "${escapeSparqlStringLiteral(clause.trailingContainsNeedle)}"))`
      : null,
    clause.rawContainsNeedle
      ? `  FILTER(CONTAINS(LCASE(STR(?label)), "${escapeSparqlStringLiteral(clause.rawContainsNeedle)}"))`
      : null,
  ]).filter((entry): entry is string => entry !== null).join('\n');
}

function buildArcoSearchQuery(
  safeQuery: string,
  offset: number,
  labelSearchFilters: string,
): string {
  return `PREFIX arco: <https://w3id.org/arco/ontology/arco/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX bif: <http://www.openlinksw.com/schemas/bif#>
SELECT DISTINCT ?subject ?title ?label ?identifier ?coverage WHERE {
  VALUES ?type {
    arco:MovableCulturalProperty
    arco:ImmovableCulturalProperty
    arco:ArchaeologicalProperty
    arco:DemoEthnoAnthropologicalHeritage
  }
  ?subject a ?type .
  ?subject rdfs:label ?label .
${labelSearchFilters}
  FILTER(LANG(?label) = "it" || LANG(?label) = "")
  OPTIONAL { ?subject dc:title ?title }
  OPTIONAL { ?subject dc:identifier ?identifier }
  OPTIONAL { ?subject dc:coverage ?coverage }
} LIMIT ${ARCO_PAGE_SIZE} OFFSET ${offset}`;
}

export async function searchArco(query: string, offset = 0): Promise<ArcoSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Search query is required');
  }

  const isIdentifier = /^\d{6,}$/.test(trimmed);
  const safe = trimmed.replace(/"/g, '');

  const sparqlQuery = isIdentifier
    ? `PREFIX arco: <https://w3id.org/arco/ontology/arco/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?subject ?title ?label ?identifier ?coverage WHERE {
  OPTIONAL { ?subject dc:title ?title }
  OPTIONAL { ?subject rdfs:label ?label . FILTER(LANG(?label) = "it" || LANG(?label) = "") }
  OPTIONAL { ?subject dc:identifier ?identifier }
  OPTIONAL { ?subject dc:coverage ?coverage }
  FILTER(STR(?identifier) = "${safe}")
} LIMIT ${ARCO_PAGE_SIZE} OFFSET ${offset}`
    : '';

  if (isIdentifier) {
    const bindings = await runSparql(sparqlQuery);
    return bindings.map(bindingToSearchResult);
  }

  const indexedBifContains = buildArcoIndexedBifContains(safe);
  const indexedBindings = indexedBifContains
    ? await runSparql(
        buildArcoSearchQuery(
          safe,
          offset,
          buildLabelSearchFilters([{ bifContains: indexedBifContains }]),
        ),
      )
    : [];

  if (indexedBindings.length > 0) {
    return indexedBindings.map(bindingToSearchResult);
  }

  const tolerantBindings = await runSparql(
    buildArcoSearchQuery(safe, offset, buildLabelSearchFilters(buildArcoLabelSearchClauses(safe))),
  );
  return tolerantBindings.map(bindingToSearchResult);
}

export async function getArcoRecordDetail(uri: string): Promise<ArcoRecordDetail | null> {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error('Record URI is required');
  }

  const sparqlQuery = `PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT DISTINCT ?subject ?title ?label ?identifier ?creator ?date ?coverage ?depiction WHERE {
  BIND(<${trimmed}> AS ?subject)
  OPTIONAL { ?subject dc:title ?title }
  OPTIONAL { ?subject rdfs:label ?label . FILTER(LANG(?label) = "it" || LANG(?label) = "") }
  OPTIONAL { ?subject dc:identifier ?identifier }
  OPTIONAL { ?subject dc:creator ?creator }
  OPTIONAL { ?subject dc:date ?date }
  OPTIONAL { ?subject dc:coverage ?coverage }
  OPTIONAL { ?subject foaf:depiction ?depiction }
} LIMIT 1`;

  const bindings = await runSparql(sparqlQuery);
  if (bindings.length === 0) {
    return null;
  }

  return bindingToRecordDetail(bindings[0]);
}
