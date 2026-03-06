import type { DublinCoreMetadata } from '../../types/index.js';
import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

const DEFAULT_ARCO_LODVIEW_BASE_URL =
  'https://dati.cultura.gov.it/lodview-arco/resource/HistoricOrArtisticProperty';

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

function buildDefaultArcoEndpoint(catalogId: string): string {
  return `${DEFAULT_ARCO_LODVIEW_BASE_URL}/${encodeURIComponent(catalogId)}.html?output=application%2Fld%2Bjson`;
}

function resolveArcoRequest(
  context: PhysicalObjectImportContext
): {
  endpoint: string;
  catalogId: string | null;
} {
  const payload = isRecord(context.payload) ? context.payload : {};

  const explicitEndpoint = toNonEmptyString(payload.endpoint);

  const payloadCatalogId = toNonEmptyString(payload.catalogId);
  const sourceCatalogId = context.sourceUri ? extractCatalogIdFromText(context.sourceUri) : null;
  const catalogId = payloadCatalogId ?? sourceCatalogId;

  if (explicitEndpoint) {
    return {
      endpoint: explicitEndpoint,
      catalogId: catalogId ?? null
    };
  }

  if (!catalogId) {
    throw new Error(
      'ARCO import requires payload.endpoint, payload.catalogId, or a sourceUri containing a catalog identifier'
    );
  }

  return {
    endpoint: buildDefaultArcoEndpoint(catalogId),
    catalogId
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
    const { endpoint, catalogId } = resolveArcoRequest(context);

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
    const records = collectJsonLdRecords(jsonPayload);
    const primaryRecord = selectPrimaryRecord(records, context, catalogId);

    if (!primaryRecord) {
      throw new Error('ARCO response did not contain a readable JSON-LD record');
    }

    const dublinCore = extractDublinCore(primaryRecord);

    if (Object.keys(dublinCore).length === 0) {
      throw new Error('ARCO response did not expose extractable Dublin Core metadata');
    }

    const recordId = toNonEmptyString(primaryRecord['@id']);
    const contentType = response.headers.get('content-type') || 'unknown';

    return {
      dublinCore,
      sourceRecord: {
        endpoint,
        catalogId,
        importedAt: new Date().toISOString(),
        sourceUri: context.sourceUri,
        contentType,
        recordId,
        candidateRecordCount: records.length
      }
    };
  }
}
