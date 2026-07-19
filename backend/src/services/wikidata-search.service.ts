const WIKIDATA_API_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const WIKIMEDIA_COMMONS_API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const QID_PATTERN = /^Q[1-9]\d*$/i;

const DEFAULT_WIKIDATA_PAGE_SIZE = 20;
const configuredPageSize = Number.parseInt(process.env.WIKIDATA_SEARCH_PAGE_SIZE ?? '', 10);
export const WIKIDATA_PAGE_SIZE = Number.isFinite(configuredPageSize) && configuredPageSize > 0
  ? Math.min(configuredPageSize, 50)
  : DEFAULT_WIKIDATA_PAGE_SIZE;

const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'OCRA/1.0 Wikidata browser',
} as const;

export interface WikidataSearchResult {
  qid: string;
  uri: string;
  title: string | null;
  description: string | null;
}

export interface WikidataImageDetail {
  originalUrl: string;
  thumbnailUrl: string | null;
  filePageUrl: string;
  fileName: string;
  mimeType: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
}

export interface WikidataRecordDetail extends WikidataSearchResult {
  image: WikidataImageDetail | null;
}

interface WikidataSearchResponse {
  search?: Array<{
    id?: string;
    label?: string;
    description?: string;
  }>;
}

interface WikidataEntityResponse {
  entities?: Record<string, {
    id?: string;
    labels?: Record<string, { value?: string }>;
    descriptions?: Record<string, { value?: string }>;
    claims?: Record<string, Array<{
      mainsnak?: { datavalue?: { value?: unknown } };
    }>>;
  }>;
}

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<string, {
      title?: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        mime?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
  };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function plainText(value: string | null): string | null {
  if (!value) return null;
  const withoutMarkup = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return asNonEmptyString(withoutMarkup.replace(/\s+/g, ' '));
}

function preferredLocalizedValue(
  values: Record<string, { value?: string }> | undefined,
  languages: string[],
): string | null {
  if (!values) return null;
  for (const language of languages) {
    const value = asNonEmptyString(values[language]?.value);
    if (value) return value;
  }
  for (const value of Object.values(values)) {
    const text = asNonEmptyString(value.value);
    if (text) return text;
  }
  return null;
}

function parseLanguages(language: string): string[] {
  const requested = language
    .split(/[\s,|]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...requested, 'it', 'en'])];
}

async function fetchJson<T>(endpoint: string, parameters: Record<string, string>): Promise<T> {
  const url = new URL(endpoint);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: API_HEADERS });
  if (!response.ok) {
    throw new Error(`Wikimedia API returned ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function readImageFileName(entity: NonNullable<WikidataEntityResponse['entities']>[string]): string | null {
  const value = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return asNonEmptyString(value);
}

async function getCommonsImageDetail(fileName: string): Promise<WikidataImageDetail | null> {
  const response = await fetchJson<CommonsImageInfoResponse>(WIKIMEDIA_COMMONS_API_ENDPOINT, {
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '640',
    origin: '*',
  });
  const page = Object.values(response.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  const originalUrl = asNonEmptyString(info?.url);
  const filePageUrl = asNonEmptyString(info?.descriptionurl);
  if (!originalUrl || !filePageUrl) return null;

  const metadata = info?.extmetadata;
  const license = plainText(asNonEmptyString(metadata?.LicenseShortName?.value))
    ?? plainText(asNonEmptyString(metadata?.UsageTerms?.value));
  return {
    originalUrl,
    thumbnailUrl: asNonEmptyString(info?.thumburl),
    filePageUrl,
    fileName,
    mimeType: asNonEmptyString(info?.mime),
    license,
    licenseUrl: asNonEmptyString(metadata?.LicenseUrl?.value),
    attribution: plainText(asNonEmptyString(metadata?.Artist?.value))
      ?? plainText(asNonEmptyString(metadata?.Credit?.value)),
  };
}

/** Search Wikidata items using the requested label language. */
export async function searchWikidata(query: string, offset = 0, language = 'it'): Promise<WikidataSearchResult[]> {
  const directQid = query.trim().toUpperCase();
  if (QID_PATTERN.test(directQid)) {
    const detail = await getWikidataRecordDetail(directQid, language);
    return detail ? [{
      qid: detail.qid,
      uri: detail.uri,
      title: detail.title,
      description: detail.description,
    }] : [];
  }
  const response = await fetchJson<WikidataSearchResponse>(WIKIDATA_API_ENDPOINT, {
    action: 'wbsearchentities',
    format: 'json',
    search: query,
    language: parseLanguages(language)[0] ?? 'it',
    type: 'item',
    limit: String(WIKIDATA_PAGE_SIZE),
    continue: String(offset),
    origin: '*',
  });
  return (response.search ?? []).flatMap((entry) => {
    const qid = asNonEmptyString(entry.id);
    return qid ? [{
      qid,
      uri: `https://www.wikidata.org/entity/${qid}`,
      title: asNonEmptyString(entry.label),
      description: asNonEmptyString(entry.description),
    }] : [];
  });
}

/** Resolve an entity preview and its Commons image provenance, when available. */
export async function getWikidataRecordDetail(qid: string, language = 'it'): Promise<WikidataRecordDetail | null> {
  const response = await fetchJson<WikidataEntityResponse>(WIKIDATA_API_ENDPOINT, {
    action: 'wbgetentities',
    format: 'json',
    ids: qid,
    props: 'labels|descriptions|claims',
    languages: parseLanguages(language).join('|'),
    origin: '*',
  });
  const entity = response.entities?.[qid];
  if (!entity?.id) return null;

  const languages = parseLanguages(language);
  const imageFileName = readImageFileName(entity);
  return {
    qid: entity.id,
    uri: `https://www.wikidata.org/entity/${entity.id}`,
    title: preferredLocalizedValue(entity.labels, languages),
    description: preferredLocalizedValue(entity.descriptions, languages),
    image: imageFileName ? await getCommonsImageDetail(imageFileName) : null,
  };
}
