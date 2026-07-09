import type { DigitalAsset, HDTDocument } from '../types/index.js';
import type { EchoesProjectSnapshotReference } from 'shared';

interface EmbeddedProjectSnapshot extends EchoesProjectSnapshotReference {
  payloadJson?: string;
}

const DEFAULT_ECHOES_PROJECT_URI = 'http://echoes-eccch.eu/project/ECHOES';
const DEFAULT_HERITAGE_ENTITY_URI_BASE = 'https://data.ocra.echoes.eu/heritage-entity/';

function getEchoesProjectUri(): string {
  return process.env.ECHOES_PROJECT_URI?.trim() || DEFAULT_ECHOES_PROJECT_URI;
}

function getEchoesHeritageEntityUriBase(): string {
  const configuredBase = process.env.ECHOES_HERITAGE_ENTITY_URI_BASE?.trim();
  if (!configuredBase) {
    return DEFAULT_HERITAGE_ENTITY_URI_BASE;
  }
  return configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}

function asArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function appendLiteralElements(lines: string[], predicate: string, value: string | string[] | undefined): void {
  for (const entry of asArray(value)) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    lines.push(`    <${predicate}>${escapeXml(trimmed)}</${predicate}>`);
  }
}

function inferAssetMimeType(asset: DigitalAsset): string {
  if (asset.type === 'rti') {
    return 'image/rti';
  }
  if (asset.type === '3d-model') {
    return asset.mimeType?.trim() || 'model/gltf+json';
  }
  if (asset.mimeType?.trim()) {
    return asset.mimeType.trim();
  }
  return 'application/octet-stream';
}

function resolveHeritageEntityUri(projectId: string, hdtDocument: HDTDocument): string {
  return (
    hdtDocument.echoesContext?.heritageEntityUri?.trim() ||
    hdtDocument.physicalObjectMetadata.sourceUri?.trim() ||
    generateHeritageEntityUri(projectId)
  );
}

function resolveDigitalTwinUri(projectId: string, hdtDocument: HDTDocument): string {
  return hdtDocument.echoesContext?.digitalTwinUri?.trim() || `urn:ocra:project:${projectId}:hdt`;
}

function resolveAssetUri(projectId: string, asset: DigitalAsset): string {
  const sourceAssetUri = typeof asset.metadata?.sourceAssetUri === 'string' ? asset.metadata.sourceAssetUri.trim() : '';
  return sourceAssetUri || `urn:ocra:asset:${projectId}:${asset.id}`;
}

export function buildDefaultEchoesContext(projectId: string) {
  return {
    origin: 'local' as const,
    syncStatus: 'local' as const,
    projectUri: getEchoesProjectUri(),
  };
}

export function generateHeritageEntityUri(projectId: string): string {
  return `${getEchoesHeritageEntityUriBase()}${projectId}`;
}

export function computeEchoesSyncStatus(hdtDocument: HDTDocument): 'local' | 'registered' | 'synced' | 'dirty' {
  const context = hdtDocument.echoesContext;
  if (!context?.digitalTwinUri) {
    return 'local';
  }

  if (!context.namedGraphUri || !context.lastSyncedProjectUpdatedAt) {
    return 'registered';
  }

  const documentUpdatedAt = hdtDocument.updatedAt ? new Date(hdtDocument.updatedAt).getTime() : Number.NaN;
  const lastSyncedProjectUpdatedAt = new Date(context.lastSyncedProjectUpdatedAt).getTime();

  if (!Number.isNaN(documentUpdatedAt) && !Number.isNaN(lastSyncedProjectUpdatedAt) && documentUpdatedAt > lastSyncedProjectUpdatedAt) {
    return 'dirty';
  }

  return 'synced';
}

export function serializeHdtDocumentAsEchoesRdf(
  projectId: string,
  hdtDocument: HDTDocument,
  snapshotReference?: EmbeddedProjectSnapshot,
): string {
  const physicalObject = hdtDocument.physicalObjectMetadata;
  const dublinCore = physicalObject.dublinCore ?? {};
  const heritageEntityUri = resolveHeritageEntityUri(projectId, hdtDocument);
  const digitalTwinUri = resolveDigitalTwinUri(projectId, hdtDocument);
  const digitalAssets = Array.isArray(hdtDocument.digitalAssets) ? hdtDocument.digitalAssets : [];

  const hc1Lines: string[] = [
    `  <rdf:Description rdf:about="${escapeXml(heritageEntityUri)}">`,
    '    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC1"/>',
  ];

  appendLiteralElements(hc1Lines, 'rdfs:label', physicalObject.label || dublinCore.title);
  appendLiteralElements(hc1Lines, 'dc:title', dublinCore.title);
  appendLiteralElements(hc1Lines, 'dc:description', dublinCore.description);
  appendLiteralElements(hc1Lines, 'dc:creator', dublinCore.creator);
  appendLiteralElements(hc1Lines, 'dc:subject', dublinCore.subject);
  appendLiteralElements(hc1Lines, 'dc:date', dublinCore.date);
  appendLiteralElements(hc1Lines, 'dc:type', dublinCore.type);
  appendLiteralElements(hc1Lines, 'dc:source', dublinCore.source);
  appendLiteralElements(hc1Lines, 'dc:language', dublinCore.language);
  appendLiteralElements(hc1Lines, 'dc:coverage', dublinCore.coverage);
  appendLiteralElements(hc1Lines, 'dc:rights', dublinCore.rights);
  hc1Lines.push(`    <hdt:HP1 rdf:resource="${escapeXml(digitalTwinUri)}"/>`);
  hc1Lines.push('  </rdf:Description>');

  const hdtLines: string[] = [
    `  <rdf:Description rdf:about="${escapeXml(digitalTwinUri)}">`,
    '    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC2"/>',
  ];
  appendLiteralElements(hdtLines, 'rdfs:label', hdtDocument.echoesContext?.digitalTwinLabel || dublinCore.title);
  for (const asset of digitalAssets) {
    hdtLines.push(`    <hdt:HP3 rdf:resource="${escapeXml(resolveAssetUri(projectId, asset))}"/>`);
  }
  if (snapshotReference?.url) {
    hdtLines.push(`    <ocra:hasProjectSnapshot rdf:resource="${escapeXml(snapshotReference.url)}"/>`);
  }
  hdtLines.push('  </rdf:Description>');

  const assetBlocks = digitalAssets.map((asset) => {
    const assetUri = resolveAssetUri(projectId, asset);
    const assetLines: string[] = [
      `  <rdf:Description rdf:about="${escapeXml(assetUri)}">`,
      '    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC8"/>',
    ];

    appendLiteralElements(assetLines, 'rdfs:label', asset.label);
    appendLiteralElements(assetLines, 'dc:title', asset.title || asset.label);
    appendLiteralElements(assetLines, 'dc:description', asset.description);
    appendLiteralElements(
      assetLines,
      'dc:source',
      typeof asset.metadata?.sourceUrl === 'string' ? asset.metadata.sourceUrl : undefined,
    );
    appendLiteralElements(assetLines, 'dc:format', typeof asset.metadata?.format === 'string' ? asset.metadata.format : inferAssetMimeType(asset));
    assetLines.push(`    <hdt:HP21 rdf:resource="${escapeXml(heritageEntityUri)}"/>`);
    assetLines.push('  </rdf:Description>');
    return assetLines.join('\n');
  });

  const snapshotBlock = snapshotReference?.url
    ? [
        `  <rdf:Description rdf:about="${escapeXml(snapshotReference.url)}">`,
        '    <rdf:type rdf:resource="https://data.ocra.echoes.eu/ontology#ProjectSnapshot"/>',
        `    <dcterms:format>${escapeXml(snapshotReference.format)}</dcterms:format>`,
        `    <ocra:snapshotVersion>${String(snapshotReference.version)}</ocra:snapshotVersion>`,
        ...(snapshotReference.exportedAt
          ? [`    <dcterms:created>${escapeXml(snapshotReference.exportedAt)}</dcterms:created>`]
          : []),
        ...(snapshotReference.checksum
          ? [`    <ocra:sha256>${escapeXml(snapshotReference.checksum)}</ocra:sha256>`]
          : []),
        `    <ocra:snapshotIncludesAnnotations>${snapshotReference.includesAnnotations === true ? 'true' : 'false'}</ocra:snapshotIncludesAnnotations>`,
        ...(snapshotReference.payloadJson
          ? [`    <ocra:snapshotJson>${escapeXml(snapshotReference.payloadJson)}</ocra:snapshotJson>`]
          : []),
        '  </rdf:Description>',
      ].join('\n')
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:hdt="http://echoes-eccch.eu/hdt#"
  xmlns:ocra="https://data.ocra.echoes.eu/ontology#">

${hc1Lines.join('\n')}

${hdtLines.join('\n')}

${assetBlocks.join('\n\n')}
${snapshotBlock ? `\n\n${snapshotBlock}` : ''}
</rdf:RDF>`;
}
