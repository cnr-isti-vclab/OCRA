const EUROPEANA_SPARQL_ENDPOINT = 'https://api.europeana.eu/sparql';
export const EUROPEANA_PAGE_SIZE = 20;

const EUROPEANA_HTTP_HEADERS = {
  Accept: 'text/csv',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) OCRA-research/1.0',
} as const;

export interface EuropeanaSearchResult {
  uri: string;
  title: string | null;
  description: string | null;
  mediaUrl: string | null;
  license: string | null;
  provider: string | null;
  dataProvider: string | null;
  thumbnailUrl: string | null;
}

export interface EuropeanaRecordDetail extends EuropeanaSearchResult {
  creator: string | null;
  date: string | null;
  identifier: string | null;
  coverage: string | null;
  type: string | null;
}

type CsvRow = Record<string, string>;

function getCsvValue(row: CsvRow, key: string): string | null {
  return row[key]?.trim() || null;
}

function escapeSparqlStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeSearchTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.some((value) => value.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  return dataRows.map((row) => {
    const record: CsvRow = {};
    headerRow.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
}

async function runSparql(query: string): Promise<CsvRow[]> {
  const url = new URL(EUROPEANA_SPARQL_ENDPOINT);
  url.searchParams.set('query', query);

  const response = await fetch(url.toString(), {
    headers: EUROPEANA_HTTP_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Europeana SPARQL endpoint returned ${response.status}: ${response.statusText}`);
  }

  const body = await response.text();
  return parseCsv(body);
}

function buildSearchTermFilter(terms: string[], proxyVar: string): string {
  return terms
    .map((term) => {
      const escaped = escapeSparqlStringLiteral(term);
      return `(
    EXISTS {
      ${proxyVar} dc:title ?matchTitle .
      FILTER(CONTAINS(LCASE(STR(?matchTitle)), "${escaped}"))
    }
    ||
    EXISTS {
      ${proxyVar} dc:description ?matchDescription .
      FILTER(CONTAINS(LCASE(STR(?matchDescription)), "${escaped}"))
    }
  )`;
    })
    .join('\n  &&\n  ');
}

function buildSearchQuery(terms: string[], limit: number, offset: number): string {
  const termFilter = buildSearchTermFilter(terms, '?proxy');
  return `PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edm: <http://www.europeana.eu/schemas/edm/>
PREFIX ore: <http://www.openarchives.org/ore/terms/>
SELECT DISTINCT ?cho ?title ?titleLang ?description ?descriptionLang ?creator ?date ?identifier ?coverage ?type ?rights ?provider ?dataProvider ?thumbnail ?media WHERE {
  ?proxy edm:type "3D" ;
         ore:proxyFor ?cho .
  ?agg edm:aggregatedCHO ?cho .
  { ?agg edm:isShownBy ?media } UNION { ?agg edm:hasView ?media }
  FILTER(CONTAINS(LCASE(STR(?media)), ".glb"))
  FILTER(
  ${termFilter}
  )
  OPTIONAL {
    ?proxy dc:title ?title .
    BIND(LANG(?title) AS ?titleLang)
  }
  OPTIONAL {
    ?proxy dc:description ?description .
    BIND(LANG(?description) AS ?descriptionLang)
  }
  OPTIONAL { ?proxy dc:creator ?creator }
  OPTIONAL { ?proxy dc:date ?date }
  OPTIONAL { ?proxy dc:identifier ?identifier }
  OPTIONAL { ?proxy dc:type ?type }
  OPTIONAL { ?proxy dc:coverage ?coverage }
  OPTIONAL { ?proxy dcterms:spatial ?coverage }
  OPTIONAL { ?agg edm:rights ?rights }
  OPTIONAL { ?agg edm:provider ?provider }
  OPTIONAL { ?agg edm:dataProvider ?dataProvider }
  OPTIONAL { ?agg edm:preview ?thumbnail }
}
LIMIT ${limit}
OFFSET ${offset}`;
}

function buildBatchDetailQuery(uris: string[]): string {
  const values = uris.map((uri) => `<${uri}>`).join(' ');
  return `PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edm: <http://www.europeana.eu/schemas/edm/>
PREFIX ore: <http://www.openarchives.org/ore/terms/>
SELECT DISTINCT ?cho ?title ?titleLang ?description ?descriptionLang ?creator ?date ?identifier ?coverage ?type ?rights ?provider ?dataProvider ?thumbnail ?media WHERE {
  VALUES ?cho { ${values} }
  ?proxy ore:proxyFor ?cho .
  OPTIONAL {
    ?proxy dc:title ?title .
    BIND(LANG(?title) AS ?titleLang)
  }
  OPTIONAL {
    ?proxy dc:description ?description .
    BIND(LANG(?description) AS ?descriptionLang)
  }
  OPTIONAL { ?proxy dc:creator ?creator }
  OPTIONAL { ?proxy dc:date ?date }
  OPTIONAL { ?proxy dc:identifier ?identifier }
  OPTIONAL { ?proxy dc:type ?type }
  OPTIONAL { ?proxy dc:coverage ?coverage }
  OPTIONAL { ?proxy dcterms:spatial ?coverage }
  OPTIONAL {
    ?agg edm:aggregatedCHO ?cho .
    OPTIONAL { ?agg edm:rights ?rights }
    OPTIONAL { ?agg edm:provider ?provider }
    OPTIONAL { ?agg edm:dataProvider ?dataProvider }
    OPTIONAL { ?agg edm:preview ?thumbnail }
    OPTIONAL {
      { ?agg edm:isShownBy ?media } UNION { ?agg edm:hasView ?media }
      FILTER(CONTAINS(LCASE(STR(?media)), ".glb"))
    }
  }
}`;
}

function buildSingleDetailQuery(uri: string): string {
  return buildBatchDetailQuery([uri]);
}

function choosePreferredValue(values: Array<string | null>, options?: { preferHttp?: boolean }): string | null {
  const filtered = values.filter((value): value is string => !!value && value.trim().length > 0);
  if (filtered.length === 0) {
    return null;
  }

  if (options?.preferHttp) {
    const httpValue = filtered.find((value) => value.startsWith('http://') || value.startsWith('https://'));
    if (httpValue) {
      return httpValue;
    }
  }

  return filtered[0];
}

function choosePreferredLocalizedValue(
  rows: CsvRow[],
  valueKey: string,
  languageKey: string,
  preferredLanguage = 'en',
): string | null {
  let fallback: string | null = null;

  for (const row of rows) {
    const value = getCsvValue(row, valueKey);
    if (!value) {
      continue;
    }

    const language = (getCsvValue(row, languageKey) || '').toLowerCase();
    if (language === preferredLanguage || language.startsWith(`${preferredLanguage}-`)) {
      return value;
    }

    if (!fallback) {
      fallback = value;
    }
  }

  return fallback;
}

function groupRowsByCho(rows: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>();

  for (const row of rows) {
    const uri = getCsvValue(row, 'cho');
    if (!uri) {
      continue;
    }

    const current = grouped.get(uri);
    if (current) {
      current.push(row);
    } else {
      grouped.set(uri, [row]);
    }
  }

  return grouped;
}

function rowsToSearchResult(uri: string, rows: CsvRow[]): EuropeanaSearchResult {
  return {
    uri,
    title: choosePreferredLocalizedValue(rows, 'title', 'titleLang'),
    description: choosePreferredLocalizedValue(rows, 'description', 'descriptionLang'),
    mediaUrl: choosePreferredValue(rows.map((row) => getCsvValue(row, 'media')), { preferHttp: true }),
    license: choosePreferredValue(rows.map((row) => getCsvValue(row, 'rights')), { preferHttp: true }),
    provider: choosePreferredValue(rows.map((row) => getCsvValue(row, 'provider'))),
    dataProvider: choosePreferredValue(rows.map((row) => getCsvValue(row, 'dataProvider'))),
    thumbnailUrl: choosePreferredValue(rows.map((row) => getCsvValue(row, 'thumbnail')), { preferHttp: true }),
  };
}

function rowsToRecordDetail(uri: string, rows: CsvRow[]): EuropeanaRecordDetail {
  const base = rowsToSearchResult(uri, rows);

  return {
    ...base,
    creator: choosePreferredValue(rows.map((row) => getCsvValue(row, 'creator'))),
    date: choosePreferredValue(rows.map((row) => getCsvValue(row, 'date'))),
    identifier: choosePreferredValue(rows.map((row) => getCsvValue(row, 'identifier'))),
    coverage: choosePreferredValue(rows.map((row) => getCsvValue(row, 'coverage'))),
    type: choosePreferredValue(rows.map((row) => getCsvValue(row, 'type'))),
  };
}

async function fetchBatchDetails(uris: string[]): Promise<Map<string, EuropeanaRecordDetail>> {
  if (uris.length === 0) {
    return new Map();
  }

  const rows = await runSparql(buildBatchDetailQuery(uris));
  const grouped = groupRowsByCho(rows);
  const details = new Map<string, EuropeanaRecordDetail>();

  for (const [uri, groupedRows] of grouped.entries()) {
    details.set(uri, rowsToRecordDetail(uri, groupedRows));
  }

  return details;
}

export async function searchEuropeana(query: string, offset = 0): Promise<EuropeanaSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Search query is required');
  }

  const terms = normalizeSearchTerms(trimmed);
  if (terms.length === 0) {
    throw new Error('Search query must contain at least one term with 2 or more characters');
  }

  const rows = await runSparql(buildSearchQuery(terms, EUROPEANA_PAGE_SIZE, offset));
  const grouped = groupRowsByCho(rows);

  return Array.from(grouped.entries()).map(([uri, groupedRows]) => rowsToSearchResult(uri, groupedRows));
}

export async function getEuropeanaRecordDetail(uri: string): Promise<EuropeanaRecordDetail | null> {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error('Record URI is required');
  }

  const rows = await runSparql(buildSingleDetailQuery(trimmed));
  const grouped = groupRowsByCho(rows);
  const detailRows = grouped.get(trimmed);

  if (!detailRows || detailRows.length === 0) {
    return null;
  }

  return rowsToRecordDetail(trimmed, detailRows);
}
