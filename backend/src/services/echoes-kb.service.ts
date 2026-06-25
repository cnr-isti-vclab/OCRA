import { getValidSession } from '../../db.js';
import type { User, PhysicalObjectMetadata, DigitalAssetCreateRequest, DigitalAsset } from '../types/index.js';
import { createHDTDocument, addDigitalAsset } from './hdt-metadata.service.js';
import { createManagedProject } from './project-creation.service.js';
import { getEchoesDevBearerOverride } from './echoes-dev-bearer.service.js';
import { ingestRemoteAssetIntoExistingAsset } from './remote-asset-ingestion.service.js';

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

export interface EchoesHdtListItem {
  namedGraphUri: string;
  digitalTwinUri: string;
  label: string | null;
  title: string | null;
  identifier: string | null;
  heritageEntityUri: string | null;
}

export interface EchoesHdtAsset {
  assetUri: string;
  label: string | null;
  title: string | null;
  description: string | null;
  source: string | null;
  format: string | null;
  linkedHeritageEntityUri: string | null;
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

function getBindingValue(
  binding: Record<string, SparqlBindingValue>,
  key: string
): string | null {
  return binding[key]?.value ?? null;
}

async function resolveEchoesBearer(sessionId: string): Promise<string | null> {
  const devOverride = getEchoesDevBearerOverride(sessionId);
  if (devOverride) {
    return devOverride;
  }

  const session = await getValidSession(sessionId);
  return session?.accessToken ?? null;
}

async function runSingleTripleStoreQuery(
  sessionId: string,
  query: string
): Promise<Array<Record<string, SparqlBindingValue>>> {
  const bearer = await resolveEchoesBearer(sessionId);
  if (!bearer) {
    throw new Error('Missing ECHOES bearer token');
  }

  const response = await fetch(`${getEchoesKbApiBase()}/repository/singleTripleStoreQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      executorTripleStoreId: getEchoesPublicTripleStoreId(),
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(`ECHOES KB request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as EchoesWrappedSparqlResponse;
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
ORDER BY LCASE(COALESCE(STR(?label), STR(?title), STR(?identifier), STR(?hdt)))`;

  const bindings = await runSingleTripleStoreQuery(sessionId, query);
  return bindings.map((binding) => ({
    namedGraphUri: getBindingValue(binding, 'ng') ?? '',
    digitalTwinUri: getBindingValue(binding, 'hdt') ?? '',
    label: getBindingValue(binding, 'label'),
    title: getBindingValue(binding, 'title'),
    identifier: getBindingValue(binding, 'identifier'),
    heritageEntityUri: getBindingValue(binding, 'hc1'),
  })).filter((item) => item.namedGraphUri && item.digitalTwinUri);
}

export async function getEchoesHdtDetail(
  sessionId: string,
  digitalTwinUri: string
): Promise<EchoesHdtDetail | null> {
  const escapedDtUri = escapeSparqlLiteral(digitalTwinUri);
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
  FILTER(STRSTARTS(STR(?ng), "${escapeSparqlLiteral(getEchoesUserGraphPrefix())}"))
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
      assetMap.set(assetUri, {
        assetUri,
        label: getBindingValue(binding, 'assetLabel'),
        title: getBindingValue(binding, 'assetTitle'),
        description: getBindingValue(binding, 'assetDescription'),
        source: getBindingValue(binding, 'assetSource'),
        format: getBindingValue(binding, 'assetFormat'),
        linkedHeritageEntityUri: getBindingValue(binding, 'assetHc1'),
      });
    }
  }
  detail.assets = Array.from(assetMap.values());
  return detail;
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

export async function createProjectFromEchoesHdt(
  sessionId: string,
  user: User,
  input: CreateProjectFromEchoesHdtInput
): Promise<CreateProjectFromEchoesHdtResult> {
  const detail = await getEchoesHdtDetail(sessionId, input.digitalTwinUri);
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

  await createHDTDocument(project.id, user.id, detail.physicalObjectMetadata);

  let importedAssetCount = 0;
  for (const asset of detail.assets) {
    if (!asset.source) {
      continue;
    }

    const normalizedAsset: Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'> = {
      projectId: project.id,
      type: mapEchoesFormatToOcrAssetType(asset.format),
      label: asset.label || asset.title || asset.assetUri,
      title: asset.title || undefined,
      description: asset.description || undefined,
      entryPointUrl: asset.source,
      mimeType: asset.format || undefined,
      metadata: {
        sourceAssetUri: asset.assetUri,
        linkedHeritageEntityUri: asset.linkedHeritageEntityUri,
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

  return {
    project,
    echoes: detail,
    importedAssetCount,
  };
}
