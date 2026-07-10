import type { DublinCoreMetadata } from '../../types/index.js';
import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

const ARCO_LODVIEW_RESOURCE_BASE_URL = 'https://dati.cultura.gov.it/lodview-arco/resource';
const DEFAULT_ARCO_RESOURCE_CLASS = 'HistoricOrArtisticProperty';

const CATALOG_ID_PATTERN = /(\d{6,})/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLikelyUri(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('http://') || value.startsWith('https://');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }

  return unique;
}

function toStringArray(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => toStringArray(entry)));
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value).trim()].filter((entry) => entry.length > 0);
  }

  if (isRecord(value)) {
    const literal = toNonEmptyString(value['@value']);
    if (literal) {
      return [literal];
    }

    const iri = toNonEmptyString(value['@id']);
    if (iri) {
      return [iri];
    }

    const plainValue = toNonEmptyString(value.value);
    if (plainValue) {
      return [plainValue];
    }
  }

  return [];
}

function extractCatalogIdFromText(value: string): string | null {
  const match = value.match(CATALOG_ID_PATTERN);
  return match ? match[1] : null;
}

function extractArcoResourceClass(sourceUri: string): string | null {
  try {
    const pathSegments = new URL(sourceUri).pathname.split('/').filter(Boolean);
    const resourceIndex = pathSegments.lastIndexOf('resource');
    const resourceClass = resourceIndex >= 0 ? pathSegments[resourceIndex + 1] : undefined;
    return resourceClass && /^[A-Za-z][A-Za-z0-9_-]*$/.test(resourceClass) ? resourceClass : null;
  } catch {
    return null;
  }
}

function pickRecordValue(record: Record<string, unknown>, keys: string[]): string[] {
  return uniqueStrings(
    keys.flatMap((key) => {
      if (!(key in record)) {
        return [];
      }
      return toStringArray(record[key]);
    })
  );
}

function joinValues(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.join(', ');
}

function pickBestValue(values: string[], options?: { preferNonUri?: boolean }): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  if (options?.preferNonUri) {
    const nonUriValues = values.filter((value) => !isLikelyUri(value));
    if (nonUriValues.length > 0) {
      return nonUriValues[0];
    }
  }

  return values[0];
}

function extractPreferredLabel(labelValue: unknown): string | undefined {
  if (!Array.isArray(labelValue)) {
    return undefined;
  }

  const entries: Array<{ language?: string; value: string }> = [];
  for (const rawEntry of labelValue) {
    if (!isRecord(rawEntry)) {
      continue;
    }

    const value = toNonEmptyString(rawEntry['@value']);
    if (!value) {
      continue;
    }

    const language = toNonEmptyString(rawEntry['@language'])?.toLowerCase();
    if (language) {
      entries.push({ language, value });
    } else {
      entries.push({ value });
    }
  }

  if (entries.length === 0) {
    return undefined;
  }

  const italian = entries.find((entry) => entry.language === 'it');
  if (italian) {
    return italian.value;
  }

  const english = entries.find((entry) => entry.language === 'en');
  if (english) {
    return english.value;
  }

  return entries[0].value;
}

function buildPrefixMap(payload: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!isRecord(payload)) return map;

  const ctx = payload['@context'];
  if (!isRecord(ctx)) return map;

  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string' && !key.startsWith('@')) {
      map[key] = value;
    }
  }
  return map;
}

function expandCurie(value: string, prefixMap: Record<string, string>): string {
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return value;

  const prefix = value.substring(0, colonIdx);
  const local = value.substring(colonIdx + 1);

  const expansion = prefixMap[prefix];
  return expansion ? expansion + local : value;
}

function collectJsonLdRecords(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) {
      continue;
    }

    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }

    if (!isRecord(current)) {
      continue;
    }

    records.push(current);

    if (Array.isArray(current['@graph'])) {
      stack.push(current['@graph']);
    }
  }

  return records;
}

function recordMatchesCatalogId(record: Record<string, unknown>, catalogId: string): boolean {
  const candidates = pickRecordValue(record, [
    '@id',
    'identifier',
    'catalogueNumber',
    'uniqueIdentifier',
    'source',
    'isReferencedBy',
    'isDescribedByCatalogueRecord'
  ]);

  return candidates.some((candidate) => candidate.includes(catalogId));
}

function recordMatchesSourceUri(record: Record<string, unknown>, sourceUri: string): boolean {
  const source = sourceUri.toLowerCase();
  const candidates = pickRecordValue(record, ['@id', 'source', 'isReferencedBy']);

  return candidates.some((candidate) => {
    const normalized = candidate.toLowerCase();
    return normalized === source || normalized.includes(source) || source.includes(normalized);
  });
}

function selectPrimaryRecord(
  records: Record<string, unknown>[],
  context: PhysicalObjectImportContext,
  catalogId: string | null
): Record<string, unknown> | null {
  if (records.length === 0) {
    return null;
  }

  if (catalogId) {
    const byCatalog = records.find((record) => recordMatchesCatalogId(record, catalogId));
    if (byCatalog) {
      return byCatalog;
    }
  }

  if (context.sourceUri) {
    const bySourceUri = records.find((record) => recordMatchesSourceUri(record, context.sourceUri));
    if (bySourceUri) {
      return bySourceUri;
    }
  }

  const withDublinCoreField = records.find((record) => {
    const keys = [
      'title',
      'dc:title',
      'description',
      'dc:description',
      'identifier',
      'catalogueNumber',
      'subject',
      'a-cd:subject'
    ];
    return keys.some((key) => key in record);
  });

  return withDublinCoreField ?? records[0];
}

function extractDublinCore(record: Record<string, unknown>): Partial<DublinCoreMetadata> {
  const title =
    pickBestValue(pickRecordValue(record, ['title', 'dc:title']), { preferNonUri: true }) ??
    extractPreferredLabel(record.label);

  const creator = pickBestValue(
    pickRecordValue(record, ['creator', 'dc:creator', 'author', 'hasAuthor', 'hasPreferredAuthor']),
    { preferNonUri: true }
  );

  const subjectValues = pickRecordValue(record, ['subject', 'dc:subject', 'a-cd:subject', 'hasSubject']);
  const subject =
    joinValues(subjectValues.filter((value) => !isLikelyUri(value))) ??
    joinValues(subjectValues);

  const description = pickBestValue(
    pickRecordValue(record, ['dc:description', 'description', 'historicalInformation', 'comment']),
    { preferNonUri: true }
  );

  const publisher = pickBestValue(
    pickRecordValue(record, ['publisher', 'dc:publisher', 'hasCataloguingAgency']),
    { preferNonUri: true }
  );

  const contributor = joinValues(
    pickRecordValue(record, ['contributor', 'dc:contributor', 'hasAgentRole'])
  );

  const date = pickBestValue(pickRecordValue(record, ['date', 'dc:date']), { preferNonUri: true });

  const type = joinValues(pickRecordValue(record, ['type', 'dc:type', 'hasCulturalPropertyType', '@type']));

  const format = joinValues(pickRecordValue(record, ['format', 'dc:format', 'hasMeasurementCollection']));

  const identifier = pickBestValue(
    pickRecordValue(record, ['identifier', 'dc:identifier', 'uniqueIdentifier', 'catalogueNumber']),
    { preferNonUri: true }
  );

  const source = joinValues(
    pickRecordValue(record, ['source', 'dc:source', 'isReferencedBy', 'isDescribedByCatalogueRecord'])
  );

  const language = pickBestValue(pickRecordValue(record, ['language', 'dc:language']), {
    preferNonUri: true
  });

  const relation = joinValues(pickRecordValue(record, ['relation', 'dc:relation']));

  const coverage = pickBestValue(pickRecordValue(record, ['coverage', 'dc:coverage']), {
    preferNonUri: true
  });

  const rights = pickBestValue(pickRecordValue(record, ['rights', 'dc:rights']), {
    preferNonUri: true
  });

  const dublinCore: Partial<DublinCoreMetadata> = {};

  if (title) dublinCore.title = title;
  if (creator) dublinCore.creator = creator;
  if (subject) dublinCore.subject = subject;
  if (description) dublinCore.description = description;
  if (publisher) dublinCore.publisher = publisher;
  if (contributor) dublinCore.contributor = contributor;
  if (date) dublinCore.date = date;
  if (type) dublinCore.type = type;
  if (format) dublinCore.format = format;
  if (identifier) dublinCore.identifier = identifier;
  if (source) dublinCore.source = source;
  if (language) dublinCore.language = language;
  if (relation) dublinCore.relation = relation;
  if (coverage) dublinCore.coverage = coverage;
  if (rights) dublinCore.rights = rights;

  return dublinCore;
}

function buildDefaultArcoEndpoint(resourceClass: string, catalogId: string): string {
  return `${ARCO_LODVIEW_RESOURCE_BASE_URL}/${encodeURIComponent(resourceClass)}/${encodeURIComponent(catalogId)}.html?output=application%2Fld%2Bjson`;
}

function resolveArcoRequest(
  context: PhysicalObjectImportContext
): {
  endpoint: string;
  catalogId: string | null;
  resourceClass: string | null;
} {
  const payload = isRecord(context.payload) ? context.payload : {};

  const explicitEndpoint = toNonEmptyString(payload.endpoint);

  const payloadCatalogId = toNonEmptyString(payload.catalogId);
  const sourceCatalogId = context.sourceUri ? extractCatalogIdFromText(context.sourceUri) : null;
  const catalogId = payloadCatalogId ?? sourceCatalogId;
  const resourceClass = context.sourceUri ? extractArcoResourceClass(context.sourceUri) : null;

  if (catalogId && resourceClass) {
    return {
      endpoint: buildDefaultArcoEndpoint(resourceClass, catalogId),
      catalogId,
      resourceClass,
    };
  }

  if (explicitEndpoint) {
    return {
      endpoint: explicitEndpoint,
      catalogId: catalogId ?? null,
      resourceClass: null,
    };
  }

  if (!catalogId) {
    throw new Error(
      'ARCO import requires payload.endpoint, payload.catalogId, or a sourceUri containing a catalog identifier'
    );
  }

  return {
    endpoint: buildDefaultArcoEndpoint(DEFAULT_ARCO_RESOURCE_CLASS, catalogId),
    catalogId,
    resourceClass: DEFAULT_ARCO_RESOURCE_CLASS,
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('application/ld+json')) {
    return response.json();
  }

  const rawText = await response.text();
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error('ARCO endpoint did not return valid JSON-LD');
  }
}

export class ArcoPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'arco' as const;

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    const { endpoint, catalogId, resourceClass } = resolveArcoRequest(context);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/ld+json, application/json;q=0.9, */*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`ARCO endpoint returned ${response.status}: ${response.statusText}`);
    }

    const jsonPayload = await readJsonResponse(response);
    const prefixMap = buildPrefixMap(jsonPayload);
    const records = collectJsonLdRecords(jsonPayload);
    const primaryRecord = selectPrimaryRecord(records, context, catalogId);

    if (!primaryRecord) {
      throw new Error('ARCO response did not contain a readable JSON-LD record');
    }

    const dublinCore = extractDublinCore(primaryRecord);

    if (Object.keys(dublinCore).length === 0) {
      throw new Error('ARCO response did not expose extractable Dublin Core metadata');
    }

    const rawRecordId = toNonEmptyString(primaryRecord['@id']);
    const recordId = rawRecordId ? expandCurie(rawRecordId, prefixMap) : null;
    const contentType = response.headers.get('content-type') || 'unknown';
    const preferredLabel = extractPreferredLabel(primaryRecord.label);
    const canonicalUri = recordId && isLikelyUri(recordId) ? recordId : null;
    const metadataPatch: Record<string, unknown> = {};

    if (canonicalUri) {
      metadataPatch.sourceUri = canonicalUri;
    }
    if (preferredLabel) {
      metadataPatch.label = preferredLabel;
    }

    return {
      dublinCore,
      sourceRecord: {
        endpoint,
        catalogId,
        resourceClass,
        importedAt: new Date().toISOString(),
        sourceUri: context.sourceUri,
        contentType,
        recordId,
        candidateRecordCount: records.length
      },
      ...(Object.keys(metadataPatch).length > 0 ? { metadataPatch } : {}),
    };
  }
}
