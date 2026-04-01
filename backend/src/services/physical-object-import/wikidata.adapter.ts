import type { DublinCoreMetadata } from '../../types/index.js';
import type {
  PhysicalObjectImportAdapter,
  PhysicalObjectImportContext,
  PhysicalObjectImportResult
} from './adapter.interface.js';

const WIKIDATA_ENTITY_DATA_BASE = 'https://www.wikidata.org/wiki/Special:EntityData';
const WIKIDATA_WBGETENTITIES_ENDPOINT =
  'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels';
const REASONATOR_BASE = 'https://reasonator.toolforge.org';
const WIKIDATA_ENTITY_BASE = 'https://www.wikidata.org/entity';

const QID_PATTERN = /\bQ[1-9]\d*\b/i;

type LanguageMap = Record<string, { language?: string; value?: string }>;

interface WikidataEntity {
  id?: string;
  labels?: LanguageMap;
  descriptions?: LanguageMap;
  claims?: Record<string, WikidataClaim[]>;
}

interface WikidataClaim {
  mainsnak?: {
    snaktype?: string;
    datavalue?: {
      type?: string;
      value?: unknown;
    };
  };
}

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

function normalizeQid(value: string): string | null {
  const match = value.match(QID_PATTERN);
  if (!match) {
    return null;
  }

  return match[0].toUpperCase();
}

function extractQidFromText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = normalizeQid(trimmed);
  if (direct) {
    return direct;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname.toLowerCase().includes('reasonator.toolforge.org')) {
      const reasonatorQid = toNonEmptyString(parsed.searchParams.get('q'));
      if (reasonatorQid) {
        const normalized = normalizeQid(reasonatorQid);
        if (normalized) {
          return normalized;
        }
      }
    }

    const pathQid = normalizeQid(parsed.pathname);
    if (pathQid) {
      return pathQid;
    }

    for (const value of parsed.searchParams.values()) {
      const candidate = normalizeQid(value);
      if (candidate) {
        return candidate;
      }
    }
  } catch {
    // The source may be a plain QID or a non-URL token.
  }

  return null;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function resolveLanguagePreferences(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return ['it', 'en'];
  }

  const fromSingle = toNonEmptyString(payload.language) ?? toNonEmptyString(payload.lang);
  const fromArray = Array.isArray(payload.languages)
    ? payload.languages
        .map((entry) => toNonEmptyString(entry))
        .filter((entry): entry is string => !!entry)
    : [];

  const requested = [
    ...(fromSingle ? fromSingle.split(/[\s,|]+/) : []),
    ...fromArray
  ]
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return uniqueStrings([...requested, 'it', 'en']);
}

function pickLocalizedText(map: LanguageMap | undefined, languagePreferences: string[]): string | undefined {
  if (!map || typeof map !== 'object') {
    return undefined;
  }

  for (const lang of languagePreferences) {
    const candidate = toNonEmptyString(map[lang]?.value);
    if (candidate) {
      return candidate;
    }
  }

  for (const value of Object.values(map)) {
    const candidate = toNonEmptyString(value?.value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function parseWikidataTime(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawTime = toNonEmptyString(value.time);
  if (!rawTime) {
    return null;
  }

  const precision = typeof value.precision === 'number' ? value.precision : 9;
  const match = rawTime.match(/^([+-]\d+)-(\d{2})-(\d{2})T/);
  if (!match) {
    return rawTime;
  }

  const [, rawYear, month, day] = match;
  const absoluteYear = rawYear.startsWith('+') ? rawYear.slice(1) : rawYear;

  if (precision >= 11 && month !== '00' && day !== '00') {
    return `${absoluteYear}-${month}-${day}`;
  }

  if (precision >= 10 && month !== '00') {
    return `${absoluteYear}-${month}`;
  }

  return absoluteYear;
}

function parseClaimValue(value: unknown): { text?: string; entityId?: string } {
  if (typeof value === 'string') {
    return { text: value };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value) };
  }

  if (!isRecord(value)) {
    return {};
  }

  const entityId = toNonEmptyString(value.id);
  if (entityId && /^Q[1-9]\d*$/i.test(entityId)) {
    return { entityId: entityId.toUpperCase() };
  }

  if (typeof value['numeric-id'] === 'number') {
    return { entityId: `Q${value['numeric-id']}` };
  }

  const monolingualText = toNonEmptyString(value.text);
  if (monolingualText) {
    return { text: monolingualText };
  }

  if (toNonEmptyString(value.time)) {
    return { text: parseWikidataTime(value) || undefined };
  }

  const amount = toNonEmptyString(value.amount);
  if (amount) {
    return { text: amount.replace(/^\+/, '') };
  }

  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { text: `${value.latitude}, ${value.longitude}` };
  }

  return {};
}

function readClaimValues(
  entity: WikidataEntity,
  propertyIds: string[]
): {
  textValues: string[];
  entityIds: string[];
} {
  const textValues: string[] = [];
  const entityIds: string[] = [];

  const claims = entity.claims || {};

  for (const propertyId of propertyIds) {
    const propertyClaims = claims[propertyId];
    if (!Array.isArray(propertyClaims)) {
      continue;
    }

    for (const claim of propertyClaims) {
      const mainsnak = claim?.mainsnak;
      if (!mainsnak || mainsnak.snaktype !== 'value' || !mainsnak.datavalue) {
        continue;
      }

      const parsed = parseClaimValue(mainsnak.datavalue.value);
      if (parsed.text) {
        textValues.push(parsed.text);
      }
      if (parsed.entityId) {
        entityIds.push(parsed.entityId);
      }
    }
  }

  return {
    textValues: uniqueStrings(textValues),
    entityIds: uniqueStrings(entityIds)
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Wikidata endpoint did not return valid JSON');
  }
}

async function fetchEntity(entityId: string): Promise<WikidataEntity> {
  const endpoint = `${WIKIDATA_ENTITY_DATA_BASE}/${encodeURIComponent(entityId)}.json`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata EntityData endpoint returned ${response.status}: ${response.statusText}`);
  }

  const payload = await readJsonResponse(response);
  if (!isRecord(payload) || !isRecord(payload.entities)) {
    throw new Error('Wikidata response does not contain entities');
  }

  const entity = payload.entities[entityId];
  if (!isRecord(entity)) {
    throw new Error(`Wikidata entity ${entityId} not found in response`);
  }

  return entity as WikidataEntity;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchEntityLabels(entityIds: string[], languagePreferences: string[]): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  const ids = uniqueStrings(entityIds);

  if (ids.length === 0) {
    return labels;
  }

  const languageParam = uniqueStrings(languagePreferences).join('|');

  for (const chunk of chunkArray(ids, 50)) {
    const endpoint = `${WIKIDATA_WBGETENTITIES_ENDPOINT}&languages=${encodeURIComponent(languageParam)}&ids=${encodeURIComponent(chunk.join('|'))}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Wikidata label lookup returned ${response.status}: ${response.statusText}`);
    }

    const payload = await readJsonResponse(response);
    if (!isRecord(payload) || !isRecord(payload.entities)) {
      continue;
    }

    for (const [entityId, entityData] of Object.entries(payload.entities)) {
      if (!isRecord(entityData)) {
        continue;
      }

      const label = pickLocalizedText(
        isRecord(entityData.labels) ? (entityData.labels as LanguageMap) : undefined,
        languagePreferences
      );

      labels[entityId] = label || entityId;
    }
  }

  return labels;
}

function mergeResolvedValues(
  textValues: string[],
  entityIds: string[],
  labelsByEntityId: Record<string, string>
): string[] {
  const resolvedEntities = entityIds.map((entityId) => labelsByEntityId[entityId] || entityId);
  return uniqueStrings([
    ...textValues.map((value) => value.trim()).filter((value) => value.length > 0),
    ...resolvedEntities.map((value) => value.trim()).filter((value) => value.length > 0)
  ]);
}

function toCsv(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.join(', ');
}

function resolveQid(context: PhysicalObjectImportContext): string {
  const payload = isRecord(context.payload) ? context.payload : {};

  const payloadCandidates = [
    payload.qid,
    payload.entityId,
    payload.id
  ];

  for (const candidate of payloadCandidates) {
    const asString = toNonEmptyString(candidate);
    if (!asString) {
      continue;
    }

    const qid = extractQidFromText(asString);
    if (qid) {
      return qid;
    }
  }

  const qidFromSource = extractQidFromText(context.sourceUri);
  if (qidFromSource) {
    return qidFromSource;
  }

  throw new Error(
    'Wikidata import requires a valid QID (e.g. Q24628970) or a Wikidata/Reasonator URL containing it'
  );
}

export class WikidataPhysicalObjectImportAdapter implements PhysicalObjectImportAdapter {
  readonly sourceType = 'wikidata' as const;

  async importMetadata(context: PhysicalObjectImportContext): Promise<PhysicalObjectImportResult> {
    const qid = resolveQid(context);
    const languagePreferences = resolveLanguagePreferences(context.payload);
    const canonicalSourceUri = `${WIKIDATA_ENTITY_BASE}/${qid}`;
    const reasonatorUri = `${REASONATOR_BASE}/?q=${encodeURIComponent(qid)}`;

    const entity = await fetchEntity(qid);

    const creatorValues = readClaimValues(entity, ['P170', 'P84', 'P50']);
    const subjectValues = readClaimValues(entity, ['P921', 'P180']);
    const typeValues = readClaimValues(entity, ['P31', 'P279']);
    const coverageValues = readClaimValues(entity, ['P276', 'P17', 'P131']);
    const languageValues = readClaimValues(entity, ['P407']);
    const contributorValues = readClaimValues(entity, ['P710']);
    const publisherValues = readClaimValues(entity, ['P123']);
    const rightsValues = readClaimValues(entity, ['P6216']);

    const relatedEntityIds = uniqueStrings([
      ...creatorValues.entityIds,
      ...subjectValues.entityIds,
      ...typeValues.entityIds,
      ...coverageValues.entityIds,
      ...languageValues.entityIds,
      ...contributorValues.entityIds,
      ...publisherValues.entityIds,
      ...rightsValues.entityIds,
    ]);

    const labelsByEntityId = await fetchEntityLabels(relatedEntityIds, languagePreferences);

    const dateValues = readClaimValues(entity, ['P571', 'P580', 'P585', 'P577']);

    const title = pickLocalizedText(entity.labels, languagePreferences) || qid;
    const description = pickLocalizedText(entity.descriptions, languagePreferences);

    const dublinCore: Partial<DublinCoreMetadata> = {
      title,
      description,
      creator: toCsv(mergeResolvedValues(creatorValues.textValues, creatorValues.entityIds, labelsByEntityId)),
      subject: toCsv(mergeResolvedValues(subjectValues.textValues, subjectValues.entityIds, labelsByEntityId)),
      date: dateValues.textValues[0],
      type: toCsv(mergeResolvedValues(typeValues.textValues, typeValues.entityIds, labelsByEntityId)),
      identifier: qid,
      source: canonicalSourceUri,
      language: toCsv(mergeResolvedValues(languageValues.textValues, languageValues.entityIds, labelsByEntityId)),
      coverage: toCsv(mergeResolvedValues(coverageValues.textValues, coverageValues.entityIds, labelsByEntityId)),
      rights: toCsv(mergeResolvedValues(rightsValues.textValues, rightsValues.entityIds, labelsByEntityId)),
      publisher: toCsv(mergeResolvedValues(publisherValues.textValues, publisherValues.entityIds, labelsByEntityId)),
      contributor: toCsv(
        mergeResolvedValues(contributorValues.textValues, contributorValues.entityIds, labelsByEntityId)
      ),
      relation: reasonatorUri,
    };

    Object.keys(dublinCore).forEach((key) => {
      const typedKey = key as keyof DublinCoreMetadata;
      if (!dublinCore[typedKey]) {
        delete dublinCore[typedKey];
      }
    });

    return {
      dublinCore,
      sourceRecord: {
        qid,
        endpoint: `${WIKIDATA_ENTITY_DATA_BASE}/${qid}.json`,
        labelLookupEndpoint: WIKIDATA_WBGETENTITIES_ENDPOINT,
        sourceUri: context.sourceUri,
        canonicalSourceUri,
        reasonatorUri,
        importedAt: new Date().toISOString(),
        languagePreferences,
        relatedEntityCount: relatedEntityIds.length,
      },
      metadataPatch: {
        sourceUri: canonicalSourceUri,
        wikidata: {
          qid,
          reasonatorUri,
          languagePreferences,
        }
      }
    };
  }
}
