import {
  isOcraProjectSnapshotPayload,
  OCRA_PROJECT_SNAPSHOT_VERSION,
  type OcraProjectSnapshotPayload,
} from './ocra-project-snapshot.service.js';
import type {
  EchoesHdtAsset,
  EchoesHdtDetail,
  EchoesProjectSnapshotSummary,
} from './echoes-kb.service.js';
import type { PhysicalObjectMetadata } from '../types/index.js';
import {
  ECHOES_HDTO_CLASS_HC1_HERITAGE_ENTITY,
  ECHOES_HDTO_CLASS_HC2_HERITAGE_DIGITAL_TWIN,
  ECHOES_HDTO_CLASS_HC8_3D_MODEL,
  ECHOES_HDTO_CURIE_HP21_IS_3D_REPRESENTATION_OUTPUT_OF,
} from 'shared/echoes-hdto';
import { classifyPortableAssetType } from 'shared/openlime-layout';

const HC1_CLASS = ECHOES_HDTO_CLASS_HC1_HERITAGE_ENTITY;
const HC2_CLASS = ECHOES_HDTO_CLASS_HC2_HERITAGE_DIGITAL_TWIN;
const HC8_CLASS = ECHOES_HDTO_CLASS_HC8_3D_MODEL;
const SNAPSHOT_CLASS = 'https://data.ocra.echoes.eu/ontology#ProjectSnapshot';

interface RdfDescriptionBlock {
  about: string;
  innerXml: string;
}

export interface ParsedEchoesRdfImport {
  detail: EchoesHdtDetail;
  snapshotPayload?: OcraProjectSnapshotPayload;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', '\'')
    .replaceAll('&amp;', '&');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractDescriptionBlocks(rdfXml: string): RdfDescriptionBlock[] {
  const matches = rdfXml.matchAll(/<rdf:Description\b[^>]*rdf:about="([^"]+)"[^>]*>([\s\S]*?)<\/rdf:Description>/g);
  return Array.from(matches, (match) => ({
    about: decodeXmlEntities(match[1] ?? ''),
    innerXml: match[2] ?? '',
  })).filter((block) => block.about.length > 0);
}

function hasType(block: RdfDescriptionBlock, rdfTypeUri: string): boolean {
  const escapedType = rdfTypeUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<rdf:type\\s+rdf:resource="${escapedType}"\\s*/>`).test(block.innerXml);
}

function extractLiteralValues(block: RdfDescriptionBlock, tagName: string): string[] {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = block.innerXml.matchAll(new RegExp(`<${escapedTag}>([\\s\\S]*?)<\\/${escapedTag}>`, 'g'));
  return Array.from(matches, (match) => normalizeWhitespace(decodeXmlEntities(match[1] ?? ''))).filter(Boolean);
}

function extractSingleLiteral(block: RdfDescriptionBlock, tagName: string): string | null {
  return extractLiteralValues(block, tagName)[0] ?? null;
}

function extractResourceValues(block: RdfDescriptionBlock, tagName: string): string[] {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = block.innerXml.matchAll(new RegExp(`<${escapedTag}\\s+rdf:resource="([^"]+)"\\s*/>`, 'g'));
  return Array.from(matches, (match) => decodeXmlEntities(match[1] ?? '')).filter(Boolean);
}

function mapAssetType(format: string | null, source: string | null): EchoesHdtAsset['format'] {
  if (format && format.trim()) {
    return format.trim();
  }
  if (source && source.trim().toLowerCase().endsWith('.zip')) {
    return 'application/zip';
  }
  return format;
}

function getAssetImportability(asset: Pick<EchoesHdtAsset, 'source' | 'format'>): {
  importable: boolean;
  importIssue: string | null;
} {
  if (!asset.source || asset.source.trim().length === 0) {
    return {
      importable: false,
      importIssue: 'Missing source URL',
    };
  }

  const assetType = classifyPortableAssetType(asset.format, asset.source);
  if (assetType === '3d-model' || assetType === 'rti' || assetType === 'image') {
    return {
      importable: true,
      importIssue: null,
    };
  }

  return {
    importable: false,
    importIssue: asset.format ? `Unsupported format: ${asset.format}` : 'Unsupported or missing format',
  };
}

function buildPhysicalObjectMetadata(
  hc1Block: RdfDescriptionBlock | undefined,
  hc2Block: RdfDescriptionBlock,
  fileName?: string,
): PhysicalObjectMetadata {
  const sourceUri = hc1Block?.about || hc2Block.about;
  return {
    sourceUri,
    sourceType: 'echoes',
    sourceSelectionLocked: true,
    label: hc1Block ? (extractSingleLiteral(hc1Block, 'rdfs:label') ?? undefined) : undefined,
    dublinCore: hc1Block
      ? {
          title: extractSingleLiteral(hc1Block, 'dc:title') ?? undefined,
          creator: extractSingleLiteral(hc1Block, 'dc:creator') ?? undefined,
          subject: extractSingleLiteral(hc1Block, 'dc:subject') ?? undefined,
          description: extractSingleLiteral(hc1Block, 'dc:description') ?? undefined,
          date: extractSingleLiteral(hc1Block, 'dc:date') ?? undefined,
          type: extractSingleLiteral(hc1Block, 'dc:type') ?? undefined,
          identifier: extractSingleLiteral(hc1Block, 'dc:identifier') ?? undefined,
          source: extractSingleLiteral(hc1Block, 'dc:source') ?? undefined,
          language: extractSingleLiteral(hc1Block, 'dc:language') ?? undefined,
          coverage: extractSingleLiteral(hc1Block, 'dc:coverage') ?? undefined,
          rights: extractSingleLiteral(hc1Block, 'dc:rights') ?? undefined,
        }
      : undefined,
    sourceRecord: {
      importedFrom: 'rdf-file',
      fileName,
      digitalTwinUri: hc2Block.about,
      heritageEntityUri: hc1Block?.about,
      importedAt: new Date().toISOString(),
    },
  };
}

function parseSnapshot(
  snapshotBlock: RdfDescriptionBlock | undefined,
): {
  summary: EchoesProjectSnapshotSummary | null;
  payload?: OcraProjectSnapshotPayload;
} {
  if (!snapshotBlock) {
    return { summary: null };
  }

  const payloadLiteral = extractSingleLiteral(snapshotBlock, 'ocra:snapshotJson');
  let snapshotPayload: OcraProjectSnapshotPayload | undefined;
  if (payloadLiteral) {
    const parsedPayload = JSON.parse(payloadLiteral) as unknown;
    if (!isOcraProjectSnapshotPayload(parsedPayload)) {
      throw new Error('The embedded OCRA project payload inside this RDF file is invalid or unsupported.');
    }
    if (parsedPayload.manifest.version !== OCRA_PROJECT_SNAPSHOT_VERSION) {
      throw new Error(`Unsupported embedded OCRA project payload version: ${parsedPayload.manifest.version}`);
    }
    snapshotPayload = parsedPayload;
  }

  return {
    summary: {
      url: snapshotBlock.about,
      format: extractSingleLiteral(snapshotBlock, 'dcterms:format') ?? 'application/json',
      version: Number.parseInt(extractSingleLiteral(snapshotBlock, 'ocra:snapshotVersion') ?? '1', 10) || 1,
      exportedAt: extractSingleLiteral(snapshotBlock, 'dcterms:created'),
      checksum: extractSingleLiteral(snapshotBlock, 'ocra:sha256'),
      includesAnnotations: extractSingleLiteral(snapshotBlock, 'ocra:snapshotIncludesAnnotations') === null
        ? null
        : extractSingleLiteral(snapshotBlock, 'ocra:snapshotIncludesAnnotations') === 'true',
    },
    payload: snapshotPayload,
  };
}

export function parseEchoesRdfImport(rdfXml: string, fileName?: string): ParsedEchoesRdfImport {
  const blocks = extractDescriptionBlocks(rdfXml);
  if (blocks.length === 0) {
    throw new Error('The uploaded RDF file does not contain any rdf:Description blocks.');
  }

  const hc2Block = blocks.find((block) => hasType(block, HC2_CLASS));
  if (!hc2Block) {
    throw new Error('The uploaded RDF file does not contain an HC2 Digital Twin record.');
  }

  const hc1Block = blocks.find((block) => hasType(block, HC1_CLASS));
  const assetBlocks = blocks.filter((block) => hasType(block, HC8_CLASS));
  const snapshotBlock = blocks.find((block) => hasType(block, SNAPSHOT_CLASS));
  const snapshot = parseSnapshot(snapshotBlock);

  const assets: EchoesHdtAsset[] = assetBlocks.map((block) => {
    const asset: EchoesHdtAsset = {
      assetUri: block.about,
      label: extractSingleLiteral(block, 'rdfs:label'),
      title: extractSingleLiteral(block, 'dc:title'),
      description: extractSingleLiteral(block, 'dc:description'),
      source: extractSingleLiteral(block, 'dc:source'),
      format: mapAssetType(extractSingleLiteral(block, 'dc:format'), extractSingleLiteral(block, 'dc:source')),
      linkedHeritageEntityUri: extractResourceValues(block, ECHOES_HDTO_CURIE_HP21_IS_3D_REPRESENTATION_OUTPUT_OF)[0] ?? null,
      importable: false,
      importIssue: null,
    };

    const importability = getAssetImportability(asset);
    asset.importable = importability.importable;
    asset.importIssue = importability.importIssue;
    return asset;
  });

  const detail: EchoesHdtDetail = {
    namedGraphUri: '',
    digitalTwinUri: hc2Block.about,
    digitalTwinLabel: extractSingleLiteral(hc2Block, 'rdfs:label'),
    heritageEntityUri: hc1Block?.about ?? null,
    physicalObjectMetadata: buildPhysicalObjectMetadata(hc1Block, hc2Block, fileName),
    assets,
    projectSnapshot: snapshot.summary,
    projectSnapshotEmbedded: snapshot.payload !== undefined,
    embeddedProjectMetadata: snapshot.payload
      ? {
          name: snapshot.payload.project.name ?? null,
          description: snapshot.payload.project.description ?? null,
        }
      : null,
  };

  return {
    detail,
    snapshotPayload: snapshot.payload,
  };
}
