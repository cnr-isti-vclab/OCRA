import { getValidSession } from '../../db.js';
import type {
  User,
  PhysicalObjectMetadata,
  DigitalAssetCreateRequest,
  DigitalAsset,
  HDTDocument,
  EchoesContext,
  EchoesSyncStatus,
} from '../types/index.js';
import { createHDTDocument, addDigitalAsset, getHDTDocument, updateHdtEchoesContext } from './hdt-metadata.service.js';
import { createManagedProject } from './project-creation.service.js';
import { getEchoesDevBearerOverride } from './echoes-dev-bearer.service.js';
import { ingestRemoteAssetIntoExistingAsset } from './remote-asset-ingestion.service.js';
import {
  buildDefaultEchoesContext,
  computeEchoesSyncStatus,
  serializeHdtDocumentAsEchoesRdf,
} from './echoes-rdf.service.js';

const DEFAULT_ECHOES_KB_API_BASE =
  'https://echoes-kb-api-route-echoes-graphs-production.apps.dcw1.paas.psnc.pl';
const DEFAULT_ECHOES_PUBLIC_TRIPLE_STORE_ID = '6a2abf6b5d6646ff24522299';
const DEFAULT_HDT_URI_PREFIX = 'http://echoes-eccch.eu/HDT/';
const DEFAULT_USER_GRAPH_PREFIX = 'http://echoes-eccch.eu/kb/graph/user-';

function getEchoesKbApiBase(): string {
  return process.env.ECHOES_KB_API_BASE?.trim() || DEFAULT_ECHOES_KB_API_BASE;
}

function getEchoesPublicTripleStoreId(): string {
  return process.env.ECHOES_KB_PUBLIC_TRIPLE_STORE_ID?.trim() || DEFAULT_ECHOES_PUBLIC_TRIPLE_STORE_ID;
}

function getEchoesHdtUriPrefix(): string {
  return process.env.ECHOES_KB_HDT_URI_PREFIX?.trim() || DEFAULT_HDT_URI_PREFIX;
}

function getEchoesUserGraphPrefix(): string {
  return process.env.ECHOES_KB_USER_GRAPH_PREFIX?.trim() || DEFAULT_USER_GRAPH_PREFIX;
}

function escapeSparqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface SparqlBindingValue {
  type: string;
  value: string;
  datatype?: string;
  ['xml:lang']?: string;
}

interface SparqlResultsPayload {
  head?: {
    vars?: string[];
  };
  results?: {
    bindings?: Array<Record<string, SparqlBindingValue>>;
  };
}

interface EchoesWrappedSparqlResponse {
  succeed?: boolean;
  message?: string;
  results?: SparqlResultsPayload;
}

interface EchoesRegisterResponse {
  succeed?: boolean;
  dtUri?: string;
  message?: string;
}

interface EchoesImportResponse {
  succeed?: boolean;
  namedGraph?: string;
  message?: string;
}

export interface EchoesHdtListItem {
  namedGraphUri: string;
  digitalTwinUri: string;
  label: string | null;
  title: string | null;
  identifier: string | null;
  heritageEntityUri: string | null;
  graphDate: string | null;
}

export interface EchoesHdtAsset {
  assetUri: string;
  label: string | null;
  title: string | null;
  description: string | null;
  source: string | null;
  format: string | null;
  linkedHeritageEntityUri: string | null;
  importable: boolean;
  importIssue: string | null;
}

export interface EchoesHdtDetail {
  namedGraphUri: string;
  digitalTwinUri: string;
  digitalTwinLabel: string | null;
  heritageEntityUri: string | null;
  physicalObjectMetadata: PhysicalObjectMetadata;
  assets: EchoesHdtAsset[];
}

export interface CreateProjectFromEchoesHdtInput {
  digitalTwinUri: string;
  namedGraphUri?: string;
  name?: string;
  description?: string;
  public?: boolean;
  publicBaseUrl: string;
}

export interface CreateProjectFromEchoesHdtResult {
  project: {
    id: string;
    name: string;
    description: string;
    public: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  echoes: EchoesHdtDetail;
  importedAssetCount: number;
}

export interface EchoesProjectStatus {
  projectId: string;
  projectUri: string;
  origin: 'local' | 'imported';
  syncStatus: EchoesSyncStatus;
  heritageEntityUri: string | null;
  digitalTwinUri: string | null;
  namedGraphUri: string | null;
  digitalTwinLabel: string | null;
  assetCount: number;
  lastRegisteredAt: string | null;
  lastSyncedAt: string | null;
  readiness: EchoesProjectReadiness;
}

export interface EchoesReadinessIssue {
  code:
    | 'missing_identifier'
    | 'missing_title'
    | 'missing_heritage_entity_uri'
    | 'missing_asset_source_url';
  severity: 'required' | 'recommended';
  message: string;
  field: string;
  assetId?: string;
  assetLabel?: string;
}

export interface EchoesProjectReadiness {
  canRegister: boolean;
  canPublish: boolean;
  requiredIssues: EchoesReadinessIssue[];
  recommendedIssues: EchoesReadinessIssue[];
}

export interface EchoesRegisterProjectResult {
  status: EchoesProjectStatus;
}

export interface EchoesPublishProjectResult {
  status: EchoesProjectStatus;
  rdf: {
    contentType: 'application/rdf+xml';
    size: number;
  };
}

export interface DuplicateProjectHdtInEchoesInput {
  title?: string;
  description?: string;
  identifier?: string;
  heritageEntityUri?: string;
}

export interface DuplicateProjectHdtInEchoesResult extends EchoesPublishProjectResult {}

function getBindingValue(
  binding: Record<string, SparqlBindingValue>,
  key: string
): string | null {
  return binding[key]?.value ?? null;
}

function extractGraphDateFromNamedGraphUri(namedGraphUri: string): string | null {
  const trimmed = namedGraphUri.trim();
  if (!trimmed) {
    return null;
  }

  // Try timestamp_ms/YYYY-MM-DD pattern (13-digit ms epoch embedded in URI)
  const tsMatch = trimmed.match(/\/(\d{10,13})\/(\d{4}-\d{2}-\d{2})$/);
  if (tsMatch) {
    const raw = tsMatch[1];
    const ms = raw.length >= 13 ? parseInt(raw, 10) : parseInt(raw, 10) * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
    return tsMatch[2];
  }

  const match = trimmed.match(/\/(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

async function resolveEchoesBearer(sessionId: string): Promise<string | null> {
  const devOverride = getEchoesDevBearerOverride(sessionId);
  if (devOverride) {
    return devOverride;
  }

  const session = await getValidSession(sessionId);
  return session?.accessToken ?? null;
}

async function getAuthorizedHeaders(sessionId: string, accept: string): Promise<HeadersInit> {
  const bearer = await resolveEchoesBearer(sessionId);
  if (!bearer) {
    throw new Error('Missing ECHOES bearer token');
  }

  return {
    Authorization: `Bearer ${bearer}`,
    Accept: accept,
  };
}

async function fetchEchoesJson<T>(sessionId: string, input: string, init: RequestInit): Promise<T> {
  const headers = await getAuthorizedHeaders(sessionId, 'application/json');
  const response = await fetch(input, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const responseText = await response.text();
    try {
      const payload = JSON.parse(responseText) as {
        message?: string;
        error?: string;
        details?: unknown;
      };
      const details =
        typeof payload.details === 'string'
          ? payload.details
          : Array.isArray(payload.details)
            ? payload.details.join('; ')
            : '';
      const message =
        payload.message ||
        payload.error ||
        details ||
        `ECHOES KB request failed with status ${response.status}`;
      return Promise.reject(new Error(message));
    } catch {
      if (responseText) {
        throw new Error(responseText);
      }
      throw new Error(`ECHOES KB request failed with status ${response.status}`);
    }
  }

  return (await response.json()) as T;
}

async function runSingleTripleStoreQuery(
  sessionId: string,
  query: string
): Promise<Array<Record<string, SparqlBindingValue>>> {
  const payload = await fetchEchoesJson<EchoesWrappedSparqlResponse>(
    sessionId,
    `${getEchoesKbApiBase()}/repository/singleTripleStoreQuery`,
    {
    method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        executorTripleStoreId: getEchoesPublicTripleStoreId(),
        query,
      }),
    },
  );
  if (!payload.succeed || !payload.results?.results?.bindings) {
    return [];
  }

  return payload.results.results.bindings;
}

export async function listEchoesHdts(
  sessionId: string,
  search: string | null
): Promise<EchoesHdtListItem[]> {
  const searchFilter =
    typeof search === 'string' && search.trim().length > 0
      ? `
    FILTER(
      CONTAINS(LCASE(COALESCE(STR(?label), "")), LCASE("${escapeSparqlLiteral(search.trim())}")) ||
      CONTAINS(LCASE(COALESCE(STR(?title), "")), LCASE("${escapeSparqlLiteral(search.trim())}")) ||
      CONTAINS(LCASE(COALESCE(STR(?identifier), "")), LCASE("${escapeSparqlLiteral(search.trim())}"))
    )`
      : '';

  const query = `PREFIX hdt: <http://echoes-eccch.eu/hdt#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?ng ?hdt ?label ?title ?identifier ?hc1
WHERE {
  GRAPH ?ng {
    ?hdt a hdt:HC2 .
    OPTIONAL { ?hdt rdfs:label ?label }
    OPTIONAL {
      ?hc1 a hdt:HC1 ;
           hdt:HP1 ?hdt .
      OPTIONAL { ?hc1 dc:title ?title }
      OPTIONAL { ?hc1 dc:identifier ?identifier }
    }
  }
  FILTER(STRSTARTS(STR(?hdt), "${escapeSparqlLiteral(getEchoesHdtUriPrefix())}"))
  FILTER(STRSTARTS(STR(?ng), "${escapeSparqlLiteral(getEchoesUserGraphPrefix())}"))${searchFilter}
}
ORDER BY LCASE(COALESCE(STR(?label), STR(?title), STR(?identifier), STR(?hdt))) DESC(STR(?ng))`;

  const bindings = await runSingleTripleStoreQuery(sessionId, query);
  return bindings.map((binding) => ({
    namedGraphUri: getBindingValue(binding, 'ng') ?? '',
    digitalTwinUri: getBindingValue(binding, 'hdt') ?? '',
    label: getBindingValue(binding, 'label'),
    title: getBindingValue(binding, 'title'),
    identifier: getBindingValue(binding, 'identifier'),
    heritageEntityUri: getBindingValue(binding, 'hc1'),
    graphDate: extractGraphDateFromNamedGraphUri(getBindingValue(binding, 'ng') ?? ''),
  })).filter((item) => item.namedGraphUri && item.digitalTwinUri);
}

export async function getEchoesHdtDetail(
  sessionId: string,
  digitalTwinUri: string,
  namedGraphUri?: string
): Promise<EchoesHdtDetail | null> {
  const escapedDtUri = escapeSparqlLiteral(digitalTwinUri);
  const namedGraphFilter = namedGraphUri
    ? `\n  FILTER(?ng = <${escapeSparqlLiteral(namedGraphUri)}>)`
    : '';
  const query = `PREFIX hdt: <http://echoes-eccch.eu/hdt#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?ng ?hdt ?hdtLabel ?hc1 ?hc1Label ?hc1Title ?hc1Identifier ?hc1Description ?hc1Creator ?hc1Date ?hc1Coverage ?hc1Rights ?hc1Subject ?hc1Type ?hc1Language ?hc1Source ?asset ?assetLabel ?assetTitle ?assetDescription ?assetSource ?assetFormat ?assetHc1
WHERE {
  GRAPH ?ng {
    BIND(<${escapedDtUri}> AS ?hdt)
    ?hdt a hdt:HC2 .
    OPTIONAL { ?hdt rdfs:label ?hdtLabel }
    OPTIONAL {
      ?hc1 a hdt:HC1 ;
           hdt:HP1 ?hdt .
      OPTIONAL { ?hc1 rdfs:label ?hc1Label }
      OPTIONAL { ?hc1 dc:title ?hc1Title }
      OPTIONAL { ?hc1 dc:identifier ?hc1Identifier }
      OPTIONAL { ?hc1 dc:description ?hc1Description }
      OPTIONAL { ?hc1 dc:creator ?hc1Creator }
      OPTIONAL { ?hc1 dc:date ?hc1Date }
      OPTIONAL { ?hc1 dc:coverage ?hc1Coverage }
      OPTIONAL { ?hc1 dc:rights ?hc1Rights }
      OPTIONAL { ?hc1 dc:subject ?hc1Subject }
      OPTIONAL { ?hc1 dc:type ?hc1Type }
      OPTIONAL { ?hc1 dc:language ?hc1Language }
      OPTIONAL { ?hc1 dc:source ?hc1Source }
    }
    OPTIONAL {
      ?hdt hdt:HP3 ?asset .
      ?asset a hdt:HC8 .
      OPTIONAL { ?asset rdfs:label ?assetLabel }
      OPTIONAL { ?asset dc:title ?assetTitle }
      OPTIONAL { ?asset dc:description ?assetDescription }
      OPTIONAL { ?asset dc:source ?assetSource }
      OPTIONAL { ?asset dc:format ?assetFormat }
      OPTIONAL { ?asset hdt:HP21 ?assetHc1 }
    }
  }
  FILTER(STRSTARTS(STR(?ng), "${escapeSparqlLiteral(getEchoesUserGraphPrefix())}"))${namedGraphFilter}
}`;

  const bindings = await runSingleTripleStoreQuery(sessionId, query);
  if (bindings.length === 0) {
    return null;
  }

  const first = bindings[0];
  const hc1Uri = getBindingValue(first, 'hc1');
  const detail: EchoesHdtDetail = {
    namedGraphUri: getBindingValue(first, 'ng') ?? '',
    digitalTwinUri,
    digitalTwinLabel: getBindingValue(first, 'hdtLabel'),
    heritageEntityUri: hc1Uri,
    physicalObjectMetadata: {
      sourceUri: hc1Uri || digitalTwinUri,
      sourceType: 'echoes',
      sourceSelectionLocked: true,
      label: getBindingValue(first, 'hc1Label') ?? getBindingValue(first, 'hdtLabel') ?? undefined,
      dublinCore: {
        title: getBindingValue(first, 'hc1Title') ?? undefined,
        creator: getBindingValue(first, 'hc1Creator') ?? undefined,
        subject: getBindingValue(first, 'hc1Subject') ?? undefined,
        description: getBindingValue(first, 'hc1Description') ?? undefined,
        date: getBindingValue(first, 'hc1Date') ?? undefined,
        type: getBindingValue(first, 'hc1Type') ?? undefined,
        identifier: getBindingValue(first, 'hc1Identifier') ?? undefined,
        source: getBindingValue(first, 'hc1Source') ?? undefined,
        language: getBindingValue(first, 'hc1Language') ?? undefined,
        coverage: getBindingValue(first, 'hc1Coverage') ?? undefined,
        rights: getBindingValue(first, 'hc1Rights') ?? undefined,
      },
      sourceRecord: {
        namedGraphUri: getBindingValue(first, 'ng') ?? undefined,
        digitalTwinUri,
        digitalTwinLabel: getBindingValue(first, 'hdtLabel') ?? undefined,
        heritageEntityUri: hc1Uri ?? undefined,
        heritageEntityLabel: getBindingValue(first, 'hc1Label') ?? undefined,
      },
    },
    assets: [],
  };

  const assetMap = new Map<string, EchoesHdtAsset>();
  for (const binding of bindings) {
    const assetUri = getBindingValue(binding, 'asset');
    if (!assetUri) {
      continue;
    }
    if (!assetMap.has(assetUri)) {
      const source = getBindingValue(binding, 'assetSource');
      const format = getBindingValue(binding, 'assetFormat');
      const importability = getEchoesAssetImportability({ source, format });
      assetMap.set(assetUri, {
        assetUri,
        label: getBindingValue(binding, 'assetLabel'),
        title: getBindingValue(binding, 'assetTitle'),
        description: getBindingValue(binding, 'assetDescription'),
        source,
        format,
        linkedHeritageEntityUri: getBindingValue(binding, 'assetHc1'),
        importable: importability.importable,
        importIssue: importability.importIssue,
      });
    }
  }
  detail.assets = Array.from(assetMap.values());
  return detail;
}

const KNOWN_3D_EXTENSIONS = new Set(['.glb', '.gltf', '.ply', '.obj', '.fbx', '.stl', '.dae', '.3ds']);

function guessTypeFrom3dUrl(source: string): boolean {
  try {
    const pathname = new URL(source).pathname.toLowerCase();
    const dot = pathname.lastIndexOf('.');
    return dot !== -1 && KNOWN_3D_EXTENSIONS.has(pathname.slice(dot));
  } catch {
    return false;
  }
}

function mapEchoesFormatToOcrAssetType(format: string | null): DigitalAssetCreateRequest['type'] {
  if (!format) {
    return 'other';
  }

  const normalized = format.trim().toLowerCase();
  if (normalized === 'image/rti') {
    return 'rti';
  }
  if (normalized.startsWith('model/') || normalized.includes('3d')) {
    return '3d-model';
  }
  if (normalized.startsWith('image/')) {
    return 'image';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  return 'other';
}

function mapEchoesAssetToOcrType(format: string | null, source: string | null): DigitalAssetCreateRequest['type'] {
  const typeFromFormat = mapEchoesFormatToOcrAssetType(format);
  if (typeFromFormat !== 'other') {
    return typeFromFormat;
  }
  if (source && guessTypeFrom3dUrl(source)) {
    return '3d-model';
  }
  return 'other';
}

function getEchoesAssetImportability(asset: Pick<EchoesHdtAsset, 'source' | 'format'>): {
  importable: boolean;
  importIssue: string | null;
} {
  if (!asset.source || asset.source.trim().length === 0) {
    return {
      importable: false,
      importIssue: 'Missing source URL',
    };
  }

  const mappedType = mapEchoesAssetToOcrType(asset.format, asset.source);
  if (mappedType !== '3d-model' && mappedType !== 'rti') {
    return {
      importable: false,
      importIssue: asset.format ? `Unsupported format: ${asset.format}` : 'Unsupported or missing format',
    };
  }

  return {
    importable: true,
    importIssue: null,
  };
}

export async function createProjectFromEchoesHdt(
  sessionId: string,
  user: User,
  input: CreateProjectFromEchoesHdtInput
): Promise<CreateProjectFromEchoesHdtResult> {
  const detail = await getEchoesHdtDetail(sessionId, input.digitalTwinUri, input.namedGraphUri);
  if (!detail) {
    throw new Error('ECHOES HDT not found');
  }

  const fallbackName =
    input.name?.trim() ||
    detail.physicalObjectMetadata.dublinCore?.title?.trim() ||
    detail.physicalObjectMetadata.sourceRecord?.heritageEntityLabel ||
    detail.digitalTwinLabel ||
    detail.digitalTwinUri;

  const fallbackDescription =
    input.description?.trim() ||
    detail.physicalObjectMetadata.dublinCore?.description?.trim() ||
    '';

  const project = await createManagedProject({
    name: fallbackName,
    description: fallbackDescription,
    isPublic: Boolean(input.public),
    owner: user,
  });

  const importedEchoesContext: EchoesContext = {
    ...buildDefaultEchoesContext(project.id),
    origin: 'imported',
    syncStatus: 'synced',
    heritageEntityUri: detail.heritageEntityUri || detail.physicalObjectMetadata.sourceUri,
    digitalTwinUri: detail.digitalTwinUri,
    namedGraphUri: detail.namedGraphUri,
    digitalTwinLabel: detail.digitalTwinLabel || undefined,
    importedFromEchoesAt: new Date(),
  };

  await createHDTDocument(project.id, user.id, detail.physicalObjectMetadata, importedEchoesContext);

  let importedAssetCount = 0;
  for (const asset of detail.assets) {
    if (!asset.importable || !asset.source) {
      continue;
    }

    const normalizedAsset: Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'> = {
      projectId: project.id,
      type: mapEchoesAssetToOcrType(asset.format, asset.source),
      label: asset.label || asset.title || asset.assetUri,
      title: asset.title || undefined,
      description: asset.description || undefined,
      entryPointUrl: asset.source,
      mimeType: asset.format || undefined,
      metadata: {
        sourceUrl: asset.source || undefined,
        sourceAssetUri: asset.assetUri,
        linkedHeritageEntityUri: asset.linkedHeritageEntityUri || undefined,
        format: asset.format || undefined,
      },
    };

    const createdAsset = await addDigitalAsset(project.id, normalizedAsset, user.id);
    if (!createdAsset) {
      throw new Error(`Failed to create local asset shell for "${asset.assetUri}"`);
    }

    await ingestRemoteAssetIntoExistingAsset({
      projectId: project.id,
      assetId: createdAsset.assetId,
      sourceUrl: asset.source,
      userId: user.id,
      publicBaseUrl: input.publicBaseUrl,
    });

    importedAssetCount += 1;
  }

  const importedDocument = await getHDTDocument(project.id);
  if (importedDocument) {
    await updateHdtEchoesContext(project.id, {
      syncStatus: 'synced',
      assetRecords: importedDocument.digitalAssets.map((asset) => ({
        assetId: asset.id,
        assetUri: typeof asset.metadata?.sourceAssetUri === 'string'
          ? asset.metadata.sourceAssetUri
          : `urn:ocra:asset:${project.id}:${asset.id}`,
        sourceUrl: typeof asset.metadata?.sourceUrl === 'string'
          ? asset.metadata.sourceUrl
          : typeof asset.entryPointUrl === 'string'
            ? asset.entryPointUrl
            : undefined,
      })),
      lastSyncedAt: new Date(),
      lastSyncedProjectUpdatedAt: importedDocument.updatedAt ?? new Date(),
    }, user.id);
  }

  return {
    project,
    echoes: detail,
    importedAssetCount,
  };
}

function deriveEchoesContext(projectId: string, hdtDocument: HDTDocument): EchoesContext {
  return {
    ...buildDefaultEchoesContext(projectId),
    ...(hdtDocument.echoesContext ?? {}),
  };
}

function sanitizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEchoesQueryParam(value: string | undefined): string | undefined {
  const sanitized = sanitizeOptionalString(value);
  if (!sanitized) {
    return undefined;
  }

  return sanitized.replace(/\s+/g, ' ').trim();
}

function toIsoStringOrNull(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toProjectStatus(hdtDocument: HDTDocument): EchoesProjectStatus {
  const context = deriveEchoesContext(hdtDocument.projectId, hdtDocument);
  const syncStatus = computeEchoesSyncStatus({
    ...hdtDocument,
    echoesContext: context,
  });
  const readiness = buildEchoesProjectReadiness(hdtDocument.projectId, hdtDocument);

  return {
    projectId: hdtDocument.projectId,
    projectUri: context.projectUri,
    origin: context.origin,
    syncStatus,
    heritageEntityUri: context.heritageEntityUri ?? null,
    digitalTwinUri: context.digitalTwinUri ?? null,
    namedGraphUri: context.namedGraphUri ?? null,
    digitalTwinLabel: context.digitalTwinLabel ?? null,
    assetCount: Array.isArray(hdtDocument.digitalAssets) ? hdtDocument.digitalAssets.length : 0,
    lastRegisteredAt: toIsoStringOrNull(context.lastRegisteredAt),
    lastSyncedAt: toIsoStringOrNull(context.lastSyncedAt),
    readiness,
  };
}

function buildEchoesProjectReadiness(projectId: string, hdtDocument: HDTDocument): EchoesProjectReadiness {
  const context = deriveEchoesContext(projectId, hdtDocument);
  const issues: EchoesReadinessIssue[] = [];
  const dublinCore = hdtDocument.physicalObjectMetadata.dublinCore ?? {};
  const digitalAssets = Array.isArray(hdtDocument.digitalAssets) ? hdtDocument.digitalAssets : [];

  if (!normalizeEchoesQueryParam(dublinCore.identifier)) {
    issues.push({
      code: 'missing_identifier',
      severity: 'required',
      field: 'physicalObjectMetadata.dublinCore.identifier',
      message: 'Current Identifier is missing. ECHOES publication should use a stable identifier for the HC1 record.',
    });
  }

  if (!normalizeEchoesQueryParam(dublinCore.title)) {
    issues.push({
      code: 'missing_title',
      severity: 'recommended',
      field: 'physicalObjectMetadata.dublinCore.title',
      message: 'Current Title is missing. ECHOES records are clearer when the HC1 and Digital Twin have a human-readable title.',
    });
  }

  if (!sanitizeOptionalString(context.heritageEntityUri) && !sanitizeOptionalString(hdtDocument.physicalObjectMetadata.sourceUri)) {
    issues.push({
      code: 'missing_heritage_entity_uri',
      severity: 'recommended',
      field: 'physicalObjectMetadata.sourceUri',
      message: 'HC1 URI is missing. OCRA can generate one, but an explicit URI is recommended for stable ECHOES references.',
    });
  }

  for (const asset of digitalAssets) {
    const sourceUrl =
      typeof asset.metadata?.sourceUrl === 'string'
        ? sanitizeOptionalString(asset.metadata.sourceUrl)
        : undefined;

    if (!sourceUrl) {
      issues.push({
        code: 'missing_asset_source_url',
        severity: 'required',
        field: `digitalAssets.${asset.id}.metadata.sourceUrl`,
        assetId: asset.id,
        assetLabel: asset.label || asset.title || asset.id,
        message: `Digital asset "${asset.label || asset.title || asset.id}" is missing its public ECHOES source URL. ECHOES HC8 records should expose a resolvable URL that another OCRA instance can download.`,
      });
    }
  }

  const requiredIssues = issues.filter((issue) => issue.severity === 'required');
  const recommendedIssues = issues.filter((issue) => issue.severity === 'recommended');

  return {
    canRegister: true,
    canPublish: requiredIssues.length === 0,
    requiredIssues,
    recommendedIssues,
  };
}

export async function getEchoesProjectStatus(projectId: string): Promise<EchoesProjectStatus | null> {
  const hdtDocument = await getHDTDocument(projectId);
  if (!hdtDocument) {
    return null;
  }
  return toProjectStatus(hdtDocument);
}

async function requireProjectHdtDocument(projectId: string): Promise<HDTDocument> {
  const hdtDocument = await getHDTDocument(projectId);
  if (!hdtDocument) {
    throw new Error(`No HDT document found for project "${projectId}"`);
  }
  return hdtDocument;
}

async function postRdfMultipart(
  sessionId: string,
  path: string,
  form: FormData,
): Promise<EchoesImportResponse> {
  return fetchEchoesJson<EchoesImportResponse>(sessionId, `${getEchoesKbApiBase()}${path}`, {
    method: 'POST',
    body: form,
  });
}

function createRdfUploadForm(rdf: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([rdf], { type: 'application/rdf+xml' }), 'ocra-hdt.rdf');
  form.append('contentType', 'application/rdf+xml');
  return form;
}

export async function registerProjectHdtInEchoes(
  sessionId: string,
  projectId: string,
  userId?: string,
): Promise<EchoesRegisterProjectResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);

  const params = new URLSearchParams({
    heritageEntityUri: currentContext.heritageEntityUri ?? hdtDocument.physicalObjectMetadata.sourceUri,
    projectUri: currentContext.projectUri,
  });

  const title = normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.title);
  const description = normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.description);
  if (currentContext.digitalTwinUri) {
    params.set('digitalTwinUri', currentContext.digitalTwinUri);
  }
  if (title) {
    params.set('name', title);
  }
  if (description) {
    params.set('description', description);
  }

  const payload = await fetchEchoesJson<EchoesRegisterResponse>(
    sessionId,
    `${getEchoesKbApiBase()}/hdt/register?${params.toString()}`,
    { method: 'POST' },
  );

  if (!payload.succeed || !payload.dtUri) {
    throw new Error(payload.message || 'ECHOES registration failed');
  }

  const updated = await updateHdtEchoesContext(projectId, {
    origin: currentContext.origin,
    projectUri: currentContext.projectUri,
    heritageEntityUri: currentContext.heritageEntityUri ?? hdtDocument.physicalObjectMetadata.sourceUri,
    digitalTwinUri: payload.dtUri,
    digitalTwinLabel: title || currentContext.digitalTwinLabel,
    syncStatus: 'registered',
    lastRegisteredAt: new Date(),
  }, userId);

  if (!updated) {
    throw new Error('Failed to persist the registered ECHOES identifiers locally');
  }

  return { status: toProjectStatus(updated) };
}

async function publishProjectRdfToEchoes(
  sessionId: string,
  projectId: string,
  userId: string | undefined,
  mode: 'enrich' | 'replace',
): Promise<EchoesPublishProjectResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);

  if (!currentContext.digitalTwinUri) {
    throw new Error('Register the HDT in ECHOES before publishing RDF content');
  }

  if (mode === 'replace' && !currentContext.namedGraphUri) {
    throw new Error('No ECHOES named graph is linked to this project yet');
  }

  const rdf = serializeHdtDocumentAsEchoesRdf(projectId, {
    ...hdtDocument,
    echoesContext: currentContext,
  });
  const form = createRdfUploadForm(rdf);
  form.append('digitalTwinUri', currentContext.digitalTwinUri);

  if (mode === 'enrich') {
    form.append('triplestoreId', getEchoesPublicTripleStoreId());
  } else if (currentContext.namedGraphUri) {
    form.append('namedGraphUri', currentContext.namedGraphUri);
  }

  const payload = await postRdfMultipart(
    sessionId,
    mode === 'enrich' ? '/hdt/enrich' : '/hdt/replaceContent',
    form,
  );

  if (!payload.succeed) {
    throw new Error(payload.message || 'ECHOES publish failed');
  }

  const now = new Date();
  const refreshedDocument = await getHDTDocument(projectId);
  const sourceDocument = refreshedDocument ?? hdtDocument;
  const updated = await updateHdtEchoesContext(projectId, {
    origin: currentContext.origin,
    projectUri: currentContext.projectUri,
    heritageEntityUri: currentContext.heritageEntityUri,
    digitalTwinUri: currentContext.digitalTwinUri,
    digitalTwinLabel: currentContext.digitalTwinLabel || sourceDocument.physicalObjectMetadata.dublinCore?.title,
    namedGraphUri: payload.namedGraph || currentContext.namedGraphUri,
    syncStatus: 'synced',
    assetRecords: sourceDocument.digitalAssets.map((asset) => ({
      assetId: asset.id,
      assetUri: typeof asset.metadata?.sourceAssetUri === 'string'
        ? asset.metadata.sourceAssetUri
        : `urn:ocra:asset:${projectId}:${asset.id}`,
      sourceUrl: typeof asset.metadata?.sourceUrl === 'string'
        ? asset.metadata.sourceUrl
        : typeof asset.entryPointUrl === 'string'
          ? asset.entryPointUrl
          : undefined,
    })),
    lastSyncedAt: now,
    lastSyncedProjectUpdatedAt: sourceDocument.updatedAt ?? now,
  }, userId);

  if (!updated) {
    throw new Error('Failed to persist ECHOES synchronization metadata locally');
  }

  return {
    status: toProjectStatus(updated),
    rdf: {
      contentType: 'application/rdf+xml',
      size: Buffer.byteLength(rdf, 'utf8'),
    },
  };
}

export async function enrichProjectHdtInEchoes(
  sessionId: string,
  projectId: string,
  userId?: string,
): Promise<EchoesPublishProjectResult> {
  return publishProjectRdfToEchoes(sessionId, projectId, userId, 'enrich');
}

export async function replaceProjectHdtContentInEchoes(
  sessionId: string,
  projectId: string,
  userId?: string,
): Promise<EchoesPublishProjectResult> {
  return publishProjectRdfToEchoes(sessionId, projectId, userId, 'replace');
}

export async function duplicateProjectHdtAsNewInEchoes(
  sessionId: string,
  projectId: string,
  input: DuplicateProjectHdtInEchoesInput,
): Promise<DuplicateProjectHdtInEchoesResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);
  const title = normalizeEchoesQueryParam(input.title) || normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.title);
  const description = normalizeEchoesQueryParam(input.description) || normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.description);
  const identifier = normalizeEchoesQueryParam(input.identifier) || normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.identifier);
  const heritageEntityUri =
    sanitizeOptionalString(input.heritageEntityUri) ||
    `${currentContext.projectUri.replace(/\/$/, '')}/heritage-entity/${projectId}-${Date.now()}`;

  const registerParams = new URLSearchParams({
    heritageEntityUri,
    projectUri: currentContext.projectUri,
  });

  if (title) {
    registerParams.set('name', title);
  }
  if (description) {
    registerParams.set('description', description);
  }

  const registerPayload = await fetchEchoesJson<EchoesRegisterResponse>(
    sessionId,
    `${getEchoesKbApiBase()}/hdt/register?${registerParams.toString()}`,
    { method: 'POST' },
  );

  if (!registerPayload.succeed || !registerPayload.dtUri) {
    throw new Error(registerPayload.message || 'ECHOES registration failed for duplicated HDT');
  }

  const duplicateDocument: HDTDocument = {
    ...hdtDocument,
    physicalObjectMetadata: {
      ...hdtDocument.physicalObjectMetadata,
      sourceUri: heritageEntityUri,
      dublinCore: {
        ...(hdtDocument.physicalObjectMetadata.dublinCore ?? {}),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(identifier ? { identifier } : {}),
      },
    },
    echoesContext: {
      ...buildDefaultEchoesContext(projectId),
      origin: 'local',
      syncStatus: 'registered',
      projectUri: currentContext.projectUri,
      heritageEntityUri,
      digitalTwinUri: registerPayload.dtUri,
      digitalTwinLabel: title || currentContext.digitalTwinLabel,
    },
  };

  const rdf = serializeHdtDocumentAsEchoesRdf(projectId, duplicateDocument);
  const form = createRdfUploadForm(rdf);
  form.append('digitalTwinUri', registerPayload.dtUri);
  form.append('triplestoreId', getEchoesPublicTripleStoreId());

  const enrichPayload = await postRdfMultipart(sessionId, '/hdt/enrich', form);
  if (!enrichPayload.succeed) {
    throw new Error(enrichPayload.message || 'ECHOES enrich failed for duplicated HDT');
  }

  const statusBase: Omit<EchoesProjectStatus, 'readiness'> = {
    projectId,
    projectUri: currentContext.projectUri,
    origin: 'local',
    syncStatus: 'synced',
    heritageEntityUri,
    digitalTwinUri: registerPayload.dtUri,
    namedGraphUri: enrichPayload.namedGraph ?? null,
    digitalTwinLabel: title || currentContext.digitalTwinLabel || null,
    assetCount: Array.isArray(hdtDocument.digitalAssets) ? hdtDocument.digitalAssets.length : 0,
    lastRegisteredAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  };
  const status: EchoesProjectStatus = {
    ...statusBase,
    readiness: buildEchoesProjectReadiness(projectId, duplicateDocument),
  };

  return {
    status,
    rdf: {
      contentType: 'application/rdf+xml',
      size: Buffer.byteLength(rdf, 'utf8'),
    },
  };
}
