const EUROPEANA_SPARQL_ENDPOINT = 'https://api.europeana.eu/sparql';
export const EUROPEANA_PAGE_SIZE = 20;

const EUROPEANA_CANDIDATE_BATCH_SIZE = parsePositiveInt(
  process.env.EUROPEANA_CANDIDATE_BATCH_SIZE,
  25
);
const EUROPEANA_MAX_SCANNED_CANDIDATES = parsePositiveInt(
  process.env.EUROPEANA_MAX_SCANNED_CANDIDATES,
  250
);

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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

function buildCandidateQuery(limit: number, offset: number): string {
  return `PREFIX edm: <http://www.europeana.eu/schemas/edm/>
PREFIX ore: <http://www.openarchives.org/ore/terms/>
SELECT DISTINCT ?cho ?media WHERE {
  ?proxy edm:type "3D" ;
         ore:proxyFor ?cho .
  ?agg edm:aggregatedCHO ?cho .
  { ?agg edm:isShownBy ?media } UNION { ?agg edm:hasView ?media }
  FILTER(CONTAINS(LCASE(STR(?media)), ".glb"))
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
SELECT DISTINCT ?cho ?title ?description ?creator ?date ?identifier ?coverage ?type ?rights ?provider ?dataProvider ?thumbnail ?media WHERE {
  VALUES ?cho { ${values} }
  ?proxy ore:proxyFor ?cho .
  OPTIONAL {
    ?proxy dc:title ?title .
    FILTER(LANGMATCHES(LANG(?title), "en"))
  }
  OPTIONAL {
    ?proxy dc:description ?description .
    FILTER(LANGMATCHES(LANG(?description), "en"))
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
    title: choosePreferredValue(rows.map((row) => getCsvValue(row, 'title'))),
    description: choosePreferredValue(rows.map((row) => getCsvValue(row, 'description'))),
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

function matchesSearchTerms(result: EuropeanaSearchResult, terms: string[]): boolean {
  const haystacks = [
    result.title?.toLowerCase() ?? '',
    result.description?.toLowerCase() ?? '',
  ];
  return terms.every((term) => haystacks.some((haystack) => haystack.includes(term)));
}

async function fetchCandidateRows(offset: number, limit: number): Promise<CsvRow[]> {
  return runSparql(buildCandidateQuery(limit, offset));
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

async function fetchSearchBatchResults(uris: string[]): Promise<Map<string, EuropeanaSearchResult>> {
  if (uris.length === 0) {
    return new Map();
  }

  const rows = await fetchBatchDetails(uris);
  const results = new Map<string, EuropeanaSearchResult>();

  for (const [uri, detail] of rows.entries()) {
    results.set(uri, detail);
  }

  return results;
}

export async function searchEuropeana(query: string, offset = 0): Promise<EuropeanaSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Search query is required');
  }

  const terms = normalizeSearchTerms(trimmed);
  const targetCount = offset + EUROPEANA_PAGE_SIZE;
  const matches: EuropeanaSearchResult[] = [];

  let scannedCandidates = 0;
  let candidateOffset = 0;

  while (matches.length < targetCount && scannedCandidates < EUROPEANA_MAX_SCANNED_CANDIDATES) {
    const candidateRows = await fetchCandidateRows(candidateOffset, EUROPEANA_CANDIDATE_BATCH_SIZE);
    if (candidateRows.length === 0) {
      break;
    }

    candidateOffset += EUROPEANA_CANDIDATE_BATCH_SIZE;
    scannedCandidates += candidateRows.length;

    const candidateUris = Array.from(
      new Set(
        candidateRows
          .map((row) => getCsvValue(row, 'cho'))
          .filter((uri): uri is string => !!uri)
      )
    );

    const detailMap = await fetchSearchBatchResults(candidateUris);
    for (const uri of candidateUris) {
      const detail = detailMap.get(uri);
      if (!detail || !matchesSearchTerms(detail, terms)) {
        continue;
      }
      matches.push(detail);
      if (matches.length >= targetCount) {
        break;
      }
    }

    if (candidateRows.length < EUROPEANA_CANDIDATE_BATCH_SIZE) {
      break;
    }
  }

  return matches.slice(offset, offset + EUROPEANA_PAGE_SIZE);
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
