import { getValidSession } from '../../db.js';
import { getPrismaClient } from '../../db.js';
import fs from 'fs-extra';
import type {
  User,
  PhysicalObjectMetadata,
  DigitalAssetCreateRequest,
  DigitalAsset,
  HDTDocument,
  EchoesContext,
  EchoesSyncStatus,
  EchoesProjectSnapshotReference,
} from '../types/index.js';
import { createHDTDocument, addDigitalAsset, getHDTDocument, updateHdtEchoesContext } from './hdt-metadata.service.js';
import { createManagedProject } from './project-creation.service.js';
import { getEchoesDevBearerOverride } from './echoes-dev-bearer.service.js';
import { ingestRemoteAssetIntoExistingAsset } from './remote-asset-ingestion.service.js';
import { validateRemoteAssetSourceUrl } from './remote-asset-import.service.js';
import {
  buildDefaultEchoesContext,
  computeEchoesSyncStatus,
  serializeHdtDocumentAsEchoesRdf,
} from './echoes-rdf.service.js';
import {
  fetchOcraProjectSnapshot,
  type OcraProjectSnapshotPayload,
  OCRA_PROJECT_SNAPSHOT_FORMAT,
  projectSnapshotToImportSourceBundle,
  storeOcraProjectSnapshot,
} from './ocra-project-snapshot.service.js';
import {
  buildImportIdMaps,
  normalizeImportedHdtDocument,
  rewriteImportedAnnotations,
  rewriteImportedHdtDocument,
  syncLegacySceneFile,
} from './project-import-rewrite.service.js';
import { parseEchoesRdfImport } from './echoes-rdf-import.service.js';
import {
  deleteAnnotationGeometriesByProjectId,
  getAnnotationGeometryCollection,
} from '../repositories/annotation-geometry.repository.js';
import {
  deleteAnnotationDataByProjectId,
  getAnnotationDataCollection,
} from '../repositories/annotation-data.repository.js';
import { deleteAnnotationLinksByProjectId, getAnnotationLinkCollection } from '../repositories/annotation-link.repository.js';
import { deleteHdtByProjectId, updateHdtByProjectId } from '../repositories/hdt.repository.js';
import { projectRoot } from '../utils/project-static-paths.js';

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
  graphState: 'current' | 'former' | 'unknown';
  maintenanceMode: 'add' | 'replace' | 'unknown';
  previousNamedGraphUri: string | null;
  maintenanceUri: string | null;
  maintenanceActorUri: string | null;
  maintenanceTimespanUri: string | null;
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

export type EchoesImportMode =
  | 'metadata_assets'
  | 'full_project_without_annotations'
  | 'full_project_with_annotations';

export interface EchoesProjectSnapshotSummary {
  url: string;
  format: string;
  version: number;
  exportedAt: string | null;
  checksum: string | null;
  includesAnnotations: boolean | null;
}

export interface EchoesHdtDetail {
  namedGraphUri: string;
  digitalTwinUri: string;
  digitalTwinLabel: string | null;
  heritageEntityUri: string | null;
  physicalObjectMetadata: PhysicalObjectMetadata;
  assets: EchoesHdtAsset[];
  projectSnapshot: EchoesProjectSnapshotSummary | null;
}

export interface CreateProjectFromEchoesHdtInput {
  digitalTwinUri: string;
  namedGraphUri?: string;
  name?: string;
  description?: string;
  public?: boolean;
  publicBaseUrl: string;
  importMode?: EchoesImportMode;
}

export interface CreateProjectFromEchoesRdfInput {
  rdf: string;
  fileName?: string;
  name?: string;
  description?: string;
  public?: boolean;
  publicBaseUrl: string;
  importMode?: EchoesImportMode;
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
  importedAnnotationCount: number;
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
  projectSnapshot: EchoesProjectSnapshotReference | null;
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
  message?: string;
}

export interface EchoesPublishProjectResult {
  status: EchoesProjectStatus;
  rdf: {
    contentType: 'application/rdf+xml';
    size: number;
  };
}

export interface EchoesRdfExportResult {
  rdf: string;
  fileName: string;
  snapshotIncluded: boolean;
  snapshotReference?: EchoesProjectSnapshotReference & { payloadJson?: string };
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

function graphSortKey(item: Pick<EchoesHdtListItem, 'graphDate' | 'namedGraphUri'>): string {
  return `${item.graphDate ?? ''}::${item.namedGraphUri}`;
}

function compareGraphsDescending(
  left: Pick<EchoesHdtListItem, 'graphDate' | 'namedGraphUri'>,
  right: Pick<EchoesHdtListItem, 'graphDate' | 'namedGraphUri'>,
): number {
  return graphSortKey(right).localeCompare(graphSortKey(left));
}

interface EchoesMaintenanceInfo {
  maintenanceMode: 'add' | 'replace';
  previousNamedGraphUri: string | null;
  maintenanceUri: string;
  maintenanceActorUri: string | null;
  maintenanceTimespanUri: string | null;
}

async function loadEchoesNamedGraphMaintenanceInfo(
  sessionId: string,
  digitalTwinUris: string[],
): Promise<Map<string, EchoesMaintenanceInfo>> {
  if (digitalTwinUris.length === 0) {
    return new Map();
  }

  const values = digitalTwinUris
    .map((uri) => `<${escapeSparqlLiteral(uri)}>`)
    .join(' ');

  const query = `PREFIX echoes: <http://isl.ics.forth.gr/ontology/echoes/>
PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
SELECT DISTINCT ?hdt ?maintenance ?newGraph ?previousGraph ?actor ?timespan
WHERE {
  VALUES ?hdt { ${values} }
  GRAPH ?g {
    ?maintenance echoes:HP19_has_composed ?hdt ;
                 echoes:HP30_added_content ?newGraph .
    OPTIONAL { ?maintenance echoes:HP31_deleted_content ?previousGraph . }
    OPTIONAL { ?maintenance crm:P14i_was_carried_out_by ?actor . }
    OPTIONAL { ?maintenance crm:P4_has_time-span ?timespan . }
  }
  FILTER(STRSTARTS(STR(?newGraph), "${escapeSparqlLiteral(getEchoesUserGraphPrefix())}"))
}`;

  const bindings = await runSingleTripleStoreQuery(sessionId, query);
  const infoByGraph = new Map<string, EchoesMaintenanceInfo>();

  for (const binding of bindings) {
    const newGraph = getBindingValue(binding, 'newGraph');
    const maintenanceUri = getBindingValue(binding, 'maintenance');
    if (!newGraph || !maintenanceUri) {
      continue;
    }

    infoByGraph.set(newGraph, {
      maintenanceMode: getBindingValue(binding, 'previousGraph') ? 'replace' : 'add',
      previousNamedGraphUri: getBindingValue(binding, 'previousGraph'),
      maintenanceUri,
      maintenanceActorUri: getBindingValue(binding, 'actor'),
      maintenanceTimespanUri: getBindingValue(binding, 'timespan'),
    });
  }

  return infoByGraph;
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
    throw new Error('Missing ECCCH bearer token');
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
    if (response.status === 401) {
      throw new Error(
        'ECCCH authorization failed (401). The ECCCH bearer is missing or expired. Sign in again or save a fresh temporary ECCCH bearer in Profile.',
      );
    }
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
        `ECCCH repository request failed with status ${response.status}`;
      return Promise.reject(new Error(message));
    } catch {
      if (responseText) {
        throw new Error(responseText);
      }
      throw new Error(`ECCCH repository request failed with status ${response.status}`);
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
PREFIX echoes: <http://isl.ics.forth.gr/ontology/echoes/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?ng ?hdt ?membership ?label ?title ?identifier ?hc1
WHERE {
  ?hdt ?membership ?ng .
  FILTER(?membership IN (echoes:HP33_contains, echoes:HP34_contained))
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
  const baseItems: EchoesHdtListItem[] = bindings.map((binding) => ({
    namedGraphUri: getBindingValue(binding, 'ng') ?? '',
    digitalTwinUri: getBindingValue(binding, 'hdt') ?? '',
    label: getBindingValue(binding, 'label'),
    title: getBindingValue(binding, 'title'),
    identifier: getBindingValue(binding, 'identifier'),
    heritageEntityUri: getBindingValue(binding, 'hc1'),
    graphDate: extractGraphDateFromNamedGraphUri(getBindingValue(binding, 'ng') ?? ''),
    graphState:
      getBindingValue(binding, 'membership') === 'http://isl.ics.forth.gr/ontology/echoes/HP33_contains'
        ? ('current' as const)
        : getBindingValue(binding, 'membership') === 'http://isl.ics.forth.gr/ontology/echoes/HP34_contained'
          ? ('former' as const)
          : ('unknown' as const),
    maintenanceMode: 'unknown' as const,
    previousNamedGraphUri: null,
    maintenanceUri: null,
    maintenanceActorUri: null,
    maintenanceTimespanUri: null,
  })).filter((item) => item.namedGraphUri && item.digitalTwinUri);

  const uniqueDigitalTwinUris = Array.from(new Set(baseItems.map((item) => item.digitalTwinUri)));
  const maintenanceInfoByGraph = await loadEchoesNamedGraphMaintenanceInfo(sessionId, uniqueDigitalTwinUris);

  return baseItems
    .map((item) => {
      const maintenanceInfo = maintenanceInfoByGraph.get(item.namedGraphUri);
      if (!maintenanceInfo) {
        return item;
      }

      return {
        ...item,
        maintenanceMode: maintenanceInfo.maintenanceMode,
        previousNamedGraphUri: maintenanceInfo.previousNamedGraphUri,
        maintenanceUri: maintenanceInfo.maintenanceUri,
        maintenanceActorUri: maintenanceInfo.maintenanceActorUri,
        maintenanceTimespanUri: maintenanceInfo.maintenanceTimespanUri,
      };
    })
    .sort(compareGraphsDescending);
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
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX ocra: <https://data.ocra.echoes.eu/ontology#>
SELECT DISTINCT ?ng ?hdt ?hdtLabel ?hc1 ?hc1Label ?hc1Title ?hc1Identifier ?hc1Description ?hc1Creator ?hc1Date ?hc1Coverage ?hc1Rights ?hc1Subject ?hc1Type ?hc1Language ?hc1Source ?asset ?assetLabel ?assetTitle ?assetDescription ?assetSource ?assetFormat ?assetHc1 ?snapshot ?snapshotVersion ?snapshotFormat ?snapshotCreated ?snapshotChecksum ?snapshotIncludesAnnotations
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
    OPTIONAL {
      ?hdt ocra:hasProjectSnapshot ?snapshot .
      OPTIONAL { ?snapshot ocra:snapshotVersion ?snapshotVersion }
      OPTIONAL { ?snapshot dcterms:format ?snapshotFormat }
      OPTIONAL { ?snapshot dcterms:created ?snapshotCreated }
      OPTIONAL { ?snapshot ocra:sha256 ?snapshotChecksum }
      OPTIONAL { ?snapshot ocra:snapshotIncludesAnnotations ?snapshotIncludesAnnotations }
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
    projectSnapshot: getBindingValue(first, 'snapshot')
      ? {
          url: getBindingValue(first, 'snapshot') ?? '',
          format: getBindingValue(first, 'snapshotFormat') ?? OCRA_PROJECT_SNAPSHOT_FORMAT,
          version: Number.parseInt(getBindingValue(first, 'snapshotVersion') ?? '1', 10) || 1,
          exportedAt: getBindingValue(first, 'snapshotCreated'),
          checksum: getBindingValue(first, 'snapshotChecksum'),
          includesAnnotations: getBindingValue(first, 'snapshotIncludesAnnotations') === null
            ? null
            : getBindingValue(first, 'snapshotIncludesAnnotations') === 'true',
        }
      : null,
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

async function findCurrentEchoesRegistrationByHeritageEntityUri(
  sessionId: string,
  heritageEntityUri: string,
): Promise<{ digitalTwinUri: string; namedGraphUri: string | null; digitalTwinLabel: string | null } | null> {
  const trimmedHeritageEntityUri = sanitizeOptionalString(heritageEntityUri);
  if (!trimmedHeritageEntityUri) {
    return null;
  }

  const query = `PREFIX hdt: <http://echoes-eccch.eu/hdt#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX echoes: <http://isl.ics.forth.gr/ontology/echoes/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?digitalTwinUri ?ng ?label
WHERE {
  GRAPH ?g {
    {
      <${escapeSparqlLiteral(trimmedHeritageEntityUri)}> hdt:HP1 ?digitalTwinUri .
    } UNION {
      ?hc1 dc:identifier "${escapeSparqlLiteral(trimmedHeritageEntityUri)}"^^xsd:string .
      ?hc1 hdt:HP1 ?digitalTwinUri .
    }
    OPTIONAL { ?digitalTwinUri rdfs:label ?label }
  }
  OPTIONAL {
    ?digitalTwinUri echoes:HP33_contains ?ng .
    FILTER(STRSTARTS(STR(?ng), "${escapeSparqlLiteral(getEchoesUserGraphPrefix())}"))
  }
  FILTER(STRSTARTS(STR(?digitalTwinUri), "${escapeSparqlLiteral(getEchoesHdtUriPrefix())}"))
}
LIMIT 1`;

  const bindings = await runSingleTripleStoreQuery(sessionId, query);
  if (bindings.length === 0) {
    return null;
  }

  const first = bindings[0];
  const digitalTwinUri = getBindingValue(first, 'digitalTwinUri');
  if (!digitalTwinUri) {
    return null;
  }

  return {
    digitalTwinUri,
    namedGraphUri: getBindingValue(first, 'ng'),
    digitalTwinLabel: getBindingValue(first, 'label'),
  };
}

async function reconcileExistingEchoesRegistration(
  sessionId: string,
  projectId: string,
  userId: string | undefined,
  currentContext: EchoesContext,
  heritageEntityUri: string,
  _title: string | undefined,
): Promise<EchoesRegisterProjectResult | null> {
  const existingRegistration = await findCurrentEchoesRegistrationByHeritageEntityUri(sessionId, heritageEntityUri);
  if (!existingRegistration) {
    return null;
  }

  const reconciled = await updateHdtEchoesContext(projectId, {
    origin: currentContext.origin,
    projectUri: currentContext.projectUri,
    heritageEntityUri,
    digitalTwinUri: existingRegistration.digitalTwinUri,
    digitalTwinLabel: existingRegistration.digitalTwinLabel ?? (_title || currentContext.digitalTwinLabel),
    syncStatus: 'registered',
    lastRegisteredAt: new Date(),
  }, userId);

  if (!reconciled) {
    throw new Error('Failed to persist the reconciled ECCCH identifiers locally');
  }

  return {
    status: toProjectStatus(reconciled),
    message:
      `HC1 URI <${heritageEntityUri}> is already present in ECCCH. ` +
      `OCRA automatically linked this project to Digital Twin <${existingRegistration.digitalTwinUri}>. ` +
      `No named graph was assigned: publish a new named graph from this project when ready.`,
  };
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
  if (normalized === 'application/zip') {
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

function toSnapshotReference(
  snapshot: EchoesProjectSnapshotSummary | null | undefined,
): EchoesProjectSnapshotReference | undefined {
  if (!snapshot) {
    return undefined;
  }

  return {
    url: snapshot.url,
    format: snapshot.format,
    version: snapshot.version,
    exportedAt: snapshot.exportedAt ?? undefined,
    checksum: snapshot.checksum ?? undefined,
    includesAnnotations: snapshot.includesAnnotations ?? undefined,
  };
}

async function assertPortableAssetSourceUrl(sourceUrl: string): Promise<void> {
  await validateRemoteAssetSourceUrl(sourceUrl);
}

async function importEchoesAssetsIntoProject(
  projectId: string,
  userId: string,
  publicBaseUrl: string,
  assets: EchoesHdtAsset[],
): Promise<{
  importedAssetCount: number;
  importedAssetIdBySourceAssetUri: Map<string, string>;
}> {
  let importedAssetCount = 0;
  const importedAssetIdBySourceAssetUri = new Map<string, string>();

  for (const asset of assets) {
    if (!asset.importable || !asset.source) {
      continue;
    }

    await assertPortableAssetSourceUrl(asset.source);

    const normalizedAsset: Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'> = {
      projectId,
      type: mapEchoesAssetToOcrType(asset.format, asset.source),
      label: asset.label || asset.title || asset.assetUri,
      title: asset.title || undefined,
      description: asset.description || undefined,
      entryPointUrl: asset.source,
      mimeType: asset.format || undefined,
      metadata: {
        sourceUrl: asset.source,
        sourceAssetUri: asset.assetUri,
        linkedHeritageEntityUri: asset.linkedHeritageEntityUri || undefined,
        format: asset.format || undefined,
      },
    };

    const createdAsset = await addDigitalAsset(projectId, normalizedAsset, userId);
    if (!createdAsset) {
      throw new Error(`Failed to create local asset shell for "${asset.assetUri}"`);
    }

    await ingestRemoteAssetIntoExistingAsset({
      projectId,
      assetId: createdAsset.assetId,
      sourceUrl: asset.source,
      userId,
      publicBaseUrl,
    });

    importedAssetIdBySourceAssetUri.set(asset.assetUri, createdAsset.assetId);
    importedAssetCount += 1;
  }

  return { importedAssetCount, importedAssetIdBySourceAssetUri };
}

async function finalizeImportedEchoesContext(
  projectId: string,
  userId: string,
  baseContext: EchoesContext,
): Promise<void> {
  const importedDocument = await getHDTDocument(projectId);
  if (!importedDocument) {
    return;
  }

  const hasPublishedNamedGraph = typeof baseContext.namedGraphUri === 'string' && baseContext.namedGraphUri.trim().length > 0;

  await updateHdtEchoesContext(projectId, {
    ...baseContext,
    syncStatus: hasPublishedNamedGraph ? 'synced' : 'registered',
    assetRecords: importedDocument.digitalAssets.map((asset) => ({
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
    lastSyncedAt: hasPublishedNamedGraph ? new Date() : undefined,
    lastSyncedProjectUpdatedAt: hasPublishedNamedGraph ? (importedDocument.updatedAt ?? new Date()) : undefined,
  }, userId);
}

interface ProjectImportBaseInput {
  name?: string;
  description?: string;
  public?: boolean;
  publicBaseUrl: string;
}

function buildLiveEchoesImportedContext(projectId: string, detail: EchoesHdtDetail): EchoesContext {
  return {
    ...buildDefaultEchoesContext(projectId),
    origin: 'imported',
    syncStatus: 'registered',
    heritageEntityUri: detail.heritageEntityUri || detail.physicalObjectMetadata.sourceUri,
    digitalTwinUri: detail.digitalTwinUri,
    digitalTwinLabel: detail.digitalTwinLabel || undefined,
    importedFromEchoesAt: new Date(),
    projectSnapshot: toSnapshotReference(detail.projectSnapshot),
  };
}

function buildLocalRdfImportedContext(projectId: string, detail: EchoesHdtDetail): EchoesContext {
  const digitalTwinUri = isEchoesDigitalTwinUri(detail.digitalTwinUri) ? detail.digitalTwinUri : undefined;

  return {
    ...buildDefaultEchoesContext(projectId),
    origin: 'local',
    syncStatus: digitalTwinUri ? 'registered' : 'local',
    heritageEntityUri: detail.heritageEntityUri || detail.physicalObjectMetadata.sourceUri,
    digitalTwinUri,
    digitalTwinLabel: digitalTwinUri ? detail.digitalTwinLabel || undefined : undefined,
  };
}

async function importMetadataAssetsFromSourceDetail(
  user: User,
  input: ProjectImportBaseInput,
  detail: EchoesHdtDetail,
  buildContext: (projectId: string) => EchoesContext,
  options: { finalizeEchoesContext: boolean },
): Promise<CreateProjectFromEchoesHdtResult> {
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

  try {
    const baseContext = buildContext(project.id);
    await createHDTDocument(project.id, user.id, detail.physicalObjectMetadata, baseContext);
    const { importedAssetCount } = await importEchoesAssetsIntoProject(project.id, user.id, input.publicBaseUrl, detail.assets);

    if (options.finalizeEchoesContext) {
      await finalizeImportedEchoesContext(project.id, user.id, baseContext);
    }

    return {
      project,
      echoes: detail,
      importedAssetCount,
      importedAnnotationCount: 0,
    };
  } catch (error) {
    await cleanupFailedImportedProject(project.id);
    throw error;
  }
}

async function importFullOcraProjectSnapshot(
  user: User,
  input: ProjectImportBaseInput,
  detail: EchoesHdtDetail,
  snapshot: OcraProjectSnapshotPayload,
  includeAnnotations: boolean,
  buildContext: (projectId: string) => EchoesContext,
  options: {
    finalizeEchoesContext: boolean;
    missingPortableAssetMessage: string;
  },
): Promise<CreateProjectFromEchoesHdtResult> {
  const sourceBundle = projectSnapshotToImportSourceBundle(snapshot);
  if (!sourceBundle.hdtDocument) {
    throw new Error('The linked OCRA project snapshot does not contain an HDT document.');
  }

  const fallbackName =
    input.name?.trim() ||
    snapshot.project.name ||
    detail.physicalObjectMetadata.dublinCore?.title?.trim() ||
    detail.digitalTwinLabel ||
    detail.digitalTwinUri;
  const fallbackDescription =
    input.description?.trim() ||
    snapshot.project.description ||
    detail.physicalObjectMetadata.dublinCore?.description?.trim() ||
    '';

  const project = await createManagedProject({
    name: fallbackName,
    description: fallbackDescription,
    isPublic: Boolean(input.public),
    owner: user,
  });

  try {
    const baseContext = buildContext(project.id);
    await createHDTDocument(project.id, user.id, detail.physicalObjectMetadata, baseContext);

    const { importedAssetCount, importedAssetIdBySourceAssetUri } = await importEchoesAssetsIntoProject(
      project.id,
      user.id,
      input.publicBaseUrl,
      detail.assets,
    );

    const currentDocument = await getHDTDocument(project.id);
    if (!currentDocument) {
      throw new Error('Failed to load the imported project document after asset ingestion.');
    }

    const assetIdOverrides = new Map<string, string>();
    for (const asset of sourceBundle.hdtDocument.digitalAssets) {
      const sourceAssetUri = typeof asset.metadata?.sourceAssetUri === 'string'
        ? asset.metadata.sourceAssetUri
        : `urn:ocra:asset:${sourceBundle.projectPayload.project.id}:${asset.id}`;
      const importedAssetId = importedAssetIdBySourceAssetUri.get(sourceAssetUri);
      if (importedAssetId) {
        assetIdOverrides.set(asset.id, importedAssetId);
      }
    }

    if (assetIdOverrides.size < sourceBundle.hdtDocument.digitalAssets.length) {
      throw new Error(options.missingPortableAssetMessage);
    }

    const idMaps = buildImportIdMaps(sourceBundle, { assetIds: assetIdOverrides });
    const rewrittenHdtDocument = rewriteImportedHdtDocument(sourceBundle, project.id, idMaps);
    if (!rewrittenHdtDocument) {
      throw new Error('Failed to rewrite the imported OCRA HDT snapshot.');
    }

    const normalizedImportedDocument = normalizeImportedHdtDocument({
      ...rewrittenHdtDocument,
      physicalObjectMetadata: {
        ...rewrittenHdtDocument.physicalObjectMetadata,
        ...detail.physicalObjectMetadata,
        sourceRecord: {
          ...(rewrittenHdtDocument.physicalObjectMetadata.sourceRecord ?? {}),
          ...(detail.physicalObjectMetadata.sourceRecord ?? {}),
        },
      },
      digitalAssets: currentDocument.digitalAssets,
      echoesContext: baseContext,
    });

    const result = await updateHdtByProjectId(project.id, {
      $set: {
        physicalObjectMetadata: normalizedImportedDocument.physicalObjectMetadata,
        digitalAssets: normalizedImportedDocument.digitalAssets,
        scenes: normalizedImportedDocument.scenes,
        echoesContext: normalizedImportedDocument.echoesContext,
        updatedAt: new Date(),
        updatedBy: user.id,
      },
    });

    if (!result.value) {
      throw new Error('Failed to persist imported scenes and OCRA snapshot metadata.');
    }

    let importedAnnotationCount = 0;
    if (includeAnnotations) {
      const rewrittenAnnotations = rewriteImportedAnnotations(sourceBundle, project.id, idMaps);
      const [geometryCollection, dataCollection, linkCollection] = await Promise.all([
        getAnnotationGeometryCollection(),
        getAnnotationDataCollection(),
        getAnnotationLinkCollection(),
      ]);

      if (rewrittenAnnotations.geometries.length > 0) {
        await geometryCollection.insertMany(rewrittenAnnotations.geometries, { ordered: true });
      }
      if (rewrittenAnnotations.data.length > 0) {
        await dataCollection.insertMany(rewrittenAnnotations.data, { ordered: true });
      }
      if (rewrittenAnnotations.links.length > 0) {
        await linkCollection.insertMany(rewrittenAnnotations.links, { ordered: true });
      }

      importedAnnotationCount =
        rewrittenAnnotations.geometries.length +
        rewrittenAnnotations.data.length +
        rewrittenAnnotations.links.length;
    }

    await syncLegacySceneFile(project.id, normalizedImportedDocument);
    if (options.finalizeEchoesContext) {
      await finalizeImportedEchoesContext(project.id, user.id, baseContext);
    }

    return {
      project,
      echoes: detail,
      importedAssetCount,
      importedAnnotationCount,
    };
  } catch (error) {
    await cleanupFailedImportedProject(project.id);
    throw error;
  }
}

async function importFullOcraProjectSnapshotFromEchoes(
  user: User,
  input: CreateProjectFromEchoesHdtInput,
  detail: EchoesHdtDetail,
  includeAnnotations: boolean,
): Promise<CreateProjectFromEchoesHdtResult> {
  if (!detail.projectSnapshot?.url) {
    throw new Error('This ECCCH HDT does not expose an OCRA project snapshot for full import.');
  }

  const snapshot = await fetchOcraProjectSnapshot(detail.projectSnapshot.url);
  return importFullOcraProjectSnapshot(
    user,
    input,
    detail,
    snapshot,
    includeAnnotations,
    (projectId) => buildLiveEchoesImportedContext(projectId, detail),
    {
      finalizeEchoesContext: true,
      missingPortableAssetMessage:
        'Full OCRA import requires every snapshot asset to expose a portable public URL through ECCCH HC8 records.',
    },
  );
}

export async function createProjectFromEchoesHdt(
  sessionId: string,
  user: User,
  input: CreateProjectFromEchoesHdtInput
): Promise<CreateProjectFromEchoesHdtResult> {
  const detail = await getEchoesHdtDetail(sessionId, input.digitalTwinUri, input.namedGraphUri);
  if (!detail) {
    throw new Error('ECCCH HDT not found');
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

  const importMode = input.importMode ?? 'metadata_assets';
  if (importMode === 'full_project_without_annotations' || importMode === 'full_project_with_annotations') {
    return importFullOcraProjectSnapshotFromEchoes(
      user,
      input,
      detail,
      importMode === 'full_project_with_annotations',
    );
  }

  return importMetadataAssetsFromSourceDetail(
    user,
    {
      ...input,
      name: fallbackName,
      description: fallbackDescription,
    },
    detail,
    (projectId) => buildLiveEchoesImportedContext(projectId, detail),
    { finalizeEchoesContext: true },
  );
}

export async function createProjectFromEchoesRdf(
  user: User,
  input: CreateProjectFromEchoesRdfInput,
): Promise<CreateProjectFromEchoesHdtResult> {
  const parsed = parseEchoesRdfImport(input.rdf, input.fileName);
  const { detail, snapshotPayload } = parsed;
  const importMode = input.importMode ?? 'metadata_assets';

  if (importMode === 'full_project_without_annotations' || importMode === 'full_project_with_annotations') {
    if (!snapshotPayload) {
      throw new Error('This RDF file does not contain an embedded OCRA project payload. Export the RDF with OCRA payload enabled first.');
    }

    if (importMode === 'full_project_with_annotations' && detail.projectSnapshot?.includesAnnotations === false) {
      throw new Error('This RDF file was exported without annotations, so a full import with annotations is not available.');
    }

    return importFullOcraProjectSnapshot(
      user,
      input,
      detail,
      snapshotPayload,
      importMode === 'full_project_with_annotations',
      (projectId) => buildLocalRdfImportedContext(projectId, detail),
      {
        finalizeEchoesContext: false,
        missingPortableAssetMessage:
          'Full OCRA import from RDF requires every snapshot asset to expose a portable public URL in the HC8 records.',
      },
    );
  }

  return importMetadataAssetsFromSourceDetail(
    user,
    input,
    detail,
    (projectId) => buildLocalRdfImportedContext(projectId, detail),
    { finalizeEchoesContext: false },
  );
}

function deriveEchoesContext(projectId: string, hdtDocument: HDTDocument): EchoesContext {
  const sourceRecord = hdtDocument.physicalObjectMetadata?.sourceRecord;
  const fallbackDigitalTwinUri =
    sourceRecord && typeof sourceRecord === 'object' && !Array.isArray(sourceRecord)
      ? isEchoesDigitalTwinUri(typeof sourceRecord.digitalTwinUri === 'string' ? sourceRecord.digitalTwinUri : null)
        ? sourceRecord.digitalTwinUri
        : undefined
      : undefined;

  return {
    ...buildDefaultEchoesContext(projectId),
    ...(hdtDocument.echoesContext ?? {}),
    ...(fallbackDigitalTwinUri ? { digitalTwinUri: fallbackDigitalTwinUri } : {}),
    ...(!hdtDocument.echoesContext?.digitalTwinLabel && fallbackDigitalTwinUri
      ? {
          digitalTwinLabel:
            typeof sourceRecord?.digitalTwinLabel === 'string' && sourceRecord.digitalTwinLabel.trim().length > 0
              ? sourceRecord.digitalTwinLabel.trim()
              : undefined,
        }
      : {}),
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

function isEchoesDigitalTwinUri(value: string | null | undefined): value is string {
  const sanitized = sanitizeOptionalString(value ?? undefined);
  return typeof sanitized === 'string' && sanitized.startsWith(getEchoesHdtUriPrefix());
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
    heritageEntityUri: context.heritageEntityUri ?? hdtDocument.physicalObjectMetadata?.sourceUri ?? null,
    digitalTwinUri: context.digitalTwinUri ?? null,
    namedGraphUri: context.namedGraphUri ?? null,
    digitalTwinLabel: context.digitalTwinLabel ?? null,
    assetCount: Array.isArray(hdtDocument.digitalAssets) ? hdtDocument.digitalAssets.length : 0,
    lastRegisteredAt: toIsoStringOrNull(context.lastRegisteredAt),
    lastSyncedAt: toIsoStringOrNull(context.lastSyncedAt),
    projectSnapshot: context.projectSnapshot ?? null,
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
      message: 'Current Identifier is missing. ECCCH publication should use a stable identifier for the HC1 record.',
    });
  }

  if (!normalizeEchoesQueryParam(dublinCore.title)) {
    issues.push({
      code: 'missing_title',
      severity: 'recommended',
      field: 'physicalObjectMetadata.dublinCore.title',
      message: 'Current Title is missing. ECCCH records are clearer when the HC1 and Digital Twin have a human-readable title.',
    });
  }

  if (!sanitizeOptionalString(context.heritageEntityUri) && !sanitizeOptionalString(hdtDocument.physicalObjectMetadata.sourceUri)) {
    issues.push({
      code: 'missing_heritage_entity_uri',
      severity: 'recommended',
      field: 'physicalObjectMetadata.sourceUri',
      message: 'HC1 URI is missing. OCRA can generate one, but an explicit URI is recommended for stable ECCCH references.',
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
        message: `Digital asset "${asset.label || asset.title || asset.id}" is missing its public asset URL. HC8 records should expose a stable, resolvable URL that another OCRA instance can download.`,
      });
    }
  }

  const requiredIssues = issues.filter((issue) => issue.severity === 'required');
  const recommendedIssues = issues.filter((issue) => issue.severity === 'recommended');
  const canCommunicateWithEchoes = requiredIssues.length === 0;

  return {
    canRegister: canCommunicateWithEchoes,
    canPublish: canCommunicateWithEchoes,
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

async function assertProjectCanPublishToEchoes(projectId: string, hdtDocument: HDTDocument): Promise<void> {
  const readiness = buildEchoesProjectReadiness(projectId, hdtDocument);
  if (!readiness.canPublish) {
    const firstRequiredIssue = readiness.requiredIssues[0];
    throw new Error(firstRequiredIssue?.message || 'This project is missing required ECCCH publication data.');
  }

  for (const asset of hdtDocument.digitalAssets) {
    const sourceUrl = typeof asset.metadata?.sourceUrl === 'string'
      ? sanitizeOptionalString(asset.metadata.sourceUrl)
      : undefined;
    if (!sourceUrl) {
      continue;
    }
    await assertPortableAssetSourceUrl(sourceUrl);
  }
}

async function assertProjectCanRegisterInEchoes(projectId: string, hdtDocument: HDTDocument): Promise<void> {
  const readiness = buildEchoesProjectReadiness(projectId, hdtDocument);
  if (!readiness.canRegister) {
    const firstRequiredIssue = readiness.requiredIssues[0];
    throw new Error(firstRequiredIssue?.message || 'This project is missing required ECCCH publication data.');
  }
}

async function getProjectSnapshotInput(projectId: string) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      public: true,
      counter: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return { project };
}

export async function exportProjectRdfForEchoes(
  projectId: string,
  publicBaseUrl: string,
  includeProjectSnapshot: boolean,
): Promise<EchoesRdfExportResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);

  const snapshotReference = includeProjectSnapshot
    ? await storeOcraProjectSnapshot({
        ...(await getProjectSnapshotInput(projectId)),
        publicBaseUrl,
      })
    : undefined;

  return {
    rdf: serializeHdtDocumentAsEchoesRdf(projectId, {
      ...hdtDocument,
      echoesContext: currentContext,
    }, snapshotReference
      ? {
          ...snapshotReference.reference,
          payloadJson: snapshotReference.payloadJson,
        }
      : undefined),
    fileName: `hdt-${projectId}${includeProjectSnapshot ? '-with-ocra-payload' : ''}.rdf`,
    snapshotIncluded: includeProjectSnapshot,
    snapshotReference: snapshotReference
      ? {
          ...snapshotReference.reference,
          payloadJson: snapshotReference.payloadJson,
        }
      : undefined,
  };
}

async function cleanupFailedImportedProject(projectId: string): Promise<void> {
  const prisma = getPrismaClient();
  await Promise.allSettled([
    deleteHdtByProjectId(projectId),
    deleteAnnotationLinksByProjectId(projectId),
    deleteAnnotationGeometriesByProjectId(projectId),
    deleteAnnotationDataByProjectId(projectId),
    fs.remove(projectRoot(projectId)),
    prisma.projectRole.deleteMany({ where: { projectId } }),
    prisma.project.deleteMany({ where: { id: projectId } }),
  ]);
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
  await assertProjectCanRegisterInEchoes(projectId, hdtDocument);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);

  if (currentContext.digitalTwinUri) {
    return {
      status: toProjectStatus({
        ...hdtDocument,
        echoesContext: currentContext,
      }),
      message: 'The project is already linked to an ECCCH Digital Twin.',
    };
  }

  const title = normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.title);
  const description = normalizeEchoesQueryParam(hdtDocument.physicalObjectMetadata.dublinCore?.description);
  const heritageEntityUri = currentContext.heritageEntityUri ?? hdtDocument.physicalObjectMetadata.sourceUri;

  const reconciledRegistration = await reconcileExistingEchoesRegistration(
    sessionId,
    projectId,
    userId,
    currentContext,
    heritageEntityUri,
    title,
  );
  if (reconciledRegistration) {
    return reconciledRegistration;
  }

  const params = new URLSearchParams({
    heritageEntityUri,
    projectUri: currentContext.projectUri,
  });

  if (currentContext.digitalTwinUri) {
    params.set('digitalTwinUri', currentContext.digitalTwinUri);
  }
  if (title) {
    params.set('name', title);
  }
  if (description) {
    params.set('description', description);
  }

  let payload: EchoesRegisterResponse;
  try {
    payload = await fetchEchoesJson<EchoesRegisterResponse>(
      sessionId,
      `${getEchoesKbApiBase()}/hdt/register?${params.toString()}`,
      { method: 'POST' },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('already registered')) {
      const reconciled = await reconcileExistingEchoesRegistration(
        sessionId,
        projectId,
        userId,
        currentContext,
        heritageEntityUri,
        title,
      );
      if (reconciled) {
        return reconciled;
      }
      throw new Error(
        `An HDT for heritage entity <${heritageEntityUri}> is already registered in ECCCH but could not be found via SPARQL. ` +
        `Try importing the existing HDT from the ECCCH Repository source instead, or contact the ECCCH team to resolve the conflict.`,
      );
    }
    throw error;
  }

  if (!payload.succeed || !payload.dtUri) {
    if ((payload.message || '').includes('already registered')) {
      const reconciled = await reconcileExistingEchoesRegistration(
        sessionId,
        projectId,
        userId,
        currentContext,
        heritageEntityUri,
        title,
      );
      if (reconciled) {
        return reconciled;
      }
      throw new Error(
        `An HDT for heritage entity <${heritageEntityUri}> is already registered in ECCCH but could not be found via SPARQL. ` +
        `Try importing the existing HDT from the ECCCH Repository source instead, or contact the ECCCH team to resolve the conflict.`,
      );
    }
    throw new Error(payload.message || 'ECCCH registration failed');
  }

  const updated = await updateHdtEchoesContext(projectId, {
    origin: currentContext.origin,
    projectUri: currentContext.projectUri,
    heritageEntityUri,
    digitalTwinUri: payload.dtUri,
    digitalTwinLabel: title || currentContext.digitalTwinLabel,
    syncStatus: 'registered',
    lastRegisteredAt: new Date(),
  }, userId);

  if (!updated) {
    throw new Error('Failed to persist the registered ECCCH identifiers locally');
  }

  return {
    status: toProjectStatus(updated),
    message: `The project was registered in ECCCH as Digital Twin <${payload.dtUri}>.`,
  };
}

async function publishProjectRdfToEchoes(
  sessionId: string,
  projectId: string,
  userId: string | undefined,
  publicBaseUrl: string,
  mode: 'enrich' | 'replace',
): Promise<EchoesPublishProjectResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  const currentContext = deriveEchoesContext(projectId, hdtDocument);

  if (!currentContext.digitalTwinUri) {
    throw new Error('Register the HDT in ECCCH before publishing RDF content');
  }

  if (mode === 'replace' && !currentContext.namedGraphUri) {
    throw new Error('No ECCCH named graph is linked to this project yet');
  }

  const exportResult = await exportProjectRdfForEchoes(projectId, publicBaseUrl, true);
  const snapshot = exportResult.snapshotReference;
  const rdf = exportResult.rdf;
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
    throw new Error(payload.message || 'ECCCH publish failed');
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
    projectSnapshot: snapshot,
  }, userId);

  if (!updated) {
    throw new Error('Failed to persist ECCCH synchronization metadata locally');
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
  publicBaseUrl: string,
  userId?: string,
): Promise<EchoesPublishProjectResult> {
  return publishProjectRdfToEchoes(sessionId, projectId, userId, publicBaseUrl, 'enrich');
}

export async function replaceProjectHdtContentInEchoes(
  sessionId: string,
  projectId: string,
  publicBaseUrl: string,
  userId?: string,
): Promise<EchoesPublishProjectResult> {
  return publishProjectRdfToEchoes(sessionId, projectId, userId, publicBaseUrl, 'replace');
}

export async function duplicateProjectHdtAsNewInEchoes(
  sessionId: string,
  projectId: string,
  publicBaseUrl: string,
  input: DuplicateProjectHdtInEchoesInput,
): Promise<DuplicateProjectHdtInEchoesResult> {
  const hdtDocument = await requireProjectHdtDocument(projectId);
  await assertProjectCanPublishToEchoes(projectId, hdtDocument);
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
    throw new Error(registerPayload.message || 'ECCCH registration failed for duplicated HDT');
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

  const snapshot = await storeOcraProjectSnapshot({
    ...(await getProjectSnapshotInput(projectId)),
    publicBaseUrl,
  });

  const rdf = serializeHdtDocumentAsEchoesRdf(projectId, duplicateDocument, {
    ...snapshot.reference,
    payloadJson: snapshot.payloadJson,
  });
  const form = createRdfUploadForm(rdf);
  form.append('digitalTwinUri', registerPayload.dtUri);
  form.append('triplestoreId', getEchoesPublicTripleStoreId());

  const enrichPayload = await postRdfMultipart(sessionId, '/hdt/enrich', form);
  if (!enrichPayload.succeed) {
    throw new Error(enrichPayload.message || 'ECCCH enrich failed for duplicated HDT');
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
    projectSnapshot: snapshot.reference,
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
