import { describe, expect, it } from 'vitest';
import type { HDTDocument } from '../types/index.js';
import { serializeHdtDocumentAsEchoesRdf } from './echoes-rdf.service.js';
import {
  ECHOES_HDTO_CLASS_HC1_HERITAGE_ENTITY,
  ECHOES_HDTO_CLASS_HC2_HERITAGE_DIGITAL_TWIN,
  ECHOES_HDTO_CLASS_HC8_3D_MODEL,
  ECHOES_HDTO_CURIE_HP1_HAS_DIGITAL_TWIN,
  ECHOES_HDTO_CURIE_HP3_IS_DIGITAL_TWIN_COMPONENT_OF,
  ECHOES_HDTO_CURIE_HP21_IS_3D_REPRESENTATION_OUTPUT_OF,
} from 'shared/echoes-hdto';

function buildHdtDocument(): HDTDocument {
  return {
    projectId: 'project-1',
    physicalObjectMetadata: {
      sourceUri: 'https://example.org/heritage/project-1',
      sourceType: 'other',
      label: 'Test Heritage Entity',
      dublinCore: {
        title: 'Test Heritage Entity',
        description: 'A complete RDF export should keep HC1, HC2, HC8, and the OCRA payload.',
        identifier: 'https://example.org/identifier/project-1',
      },
    },
    echoesContext: {
      origin: 'local',
      syncStatus: 'dirty',
      projectUri: 'http://echoes-eccch.eu/project/ECHOES',
      heritageEntityUri: 'https://example.org/heritage/project-1',
      digitalTwinUri: 'https://example.org/hdt/project-1',
      digitalTwinLabel: 'Test Twin',
      namedGraphUri: 'https://example.org/graph/project-1',
    },
    digitalAssets: [
      {
        id: 'asset-1',
        projectId: 'project-1',
        type: '3d-model',
        label: 'Primary Model',
        title: 'Primary Model',
        uploadedAt: '2026-06-27T09:00:00.000Z',
        uploadedBy: 'user-1',
        mimeType: 'model/gltf-binary',
        metadata: {
          sourceUrl: 'https://assets.example.org/model.glb',
          sourceAssetUri: 'https://assets.example.org/id/model.glb',
        },
      },
    ],
    scenes: [
      {
        id: 'scene-1',
        label: 'Default Scene',
        isDefault: true,
        assets: [{ assetId: 'asset-1', visible: true }],
      },
    ],
    createdAt: '2026-06-27T09:00:00.000Z',
    updatedAt: '2026-06-27T09:30:00.000Z',
    createdBy: 'user-1',
    updatedBy: 'user-1',
  };
}

describe('serializeHdtDocumentAsEchoesRdf', () => {
  it('embeds the full OCRA snapshot payload alongside HC1, HC2, and HC8 data', () => {
    const payloadJson = JSON.stringify({
      snapshotVersion: 1,
      scenes: [
        {
          id: 'scene-export-1',
          label: 'Default Scene',
          annotations: [
            { id: 'annotation-1', body: 'Marker on the model' },
          ],
        },
      ],
    }, null, 2);

    const rdf = serializeHdtDocumentAsEchoesRdf('project-1', buildHdtDocument(), {
      url: 'https://example.org/snapshots/project-1.json',
      format: 'application/json',
      version: 1,
      exportedAt: '2026-06-27T09:31:00.000Z',
      checksum: 'abc123',
      includesAnnotations: true,
      payloadJson,
    });

    expect(rdf).toContain(`<rdf:type rdf:resource="${ECHOES_HDTO_CLASS_HC1_HERITAGE_ENTITY}"/>`);
    expect(rdf).toContain(`<rdf:type rdf:resource="${ECHOES_HDTO_CLASS_HC2_HERITAGE_DIGITAL_TWIN}"/>`);
    expect(rdf).toContain(`<rdf:type rdf:resource="${ECHOES_HDTO_CLASS_HC8_3D_MODEL}"/>`);
    expect(rdf).toContain('<ocra:hasProjectSnapshot rdf:resource="https://example.org/snapshots/project-1.json"/>');
    expect(rdf).toContain('<ocra:snapshotIncludesAnnotations>true</ocra:snapshotIncludesAnnotations>');
    expect(rdf).toContain('<ocra:snapshotJson>{');
    expect(rdf).toContain('&quot;annotations&quot;');
    expect(rdf).toContain('&quot;scene-export-1&quot;');
    expect(rdf).toContain('<dc:source>https://assets.example.org/model.glb</dc:source>');
    expect(rdf).toContain(`<${ECHOES_HDTO_CURIE_HP3_IS_DIGITAL_TWIN_COMPONENT_OF} rdf:resource="https://assets.example.org/id/model.glb"/>`);
  });

  it('emits the RDF predicates that ECCCH import expects to rebuild metadata and assets', () => {
    const rdf = serializeHdtDocumentAsEchoesRdf('project-1', buildHdtDocument(), {
      url: 'https://example.org/snapshots/project-1.json',
      format: 'application/json',
      version: 1,
      exportedAt: '2026-06-27T09:31:00.000Z',
      checksum: 'abc123',
      includesAnnotations: true,
      payloadJson: '{"ok":true}',
    });

    expect(rdf).toContain('<rdf:Description rdf:about="https://example.org/heritage/project-1">');
    expect(rdf).toContain(`<${ECHOES_HDTO_CURIE_HP1_HAS_DIGITAL_TWIN} rdf:resource="https://example.org/hdt/project-1"/>`);
    expect(rdf).toContain('<dc:title>Test Heritage Entity</dc:title>');
    expect(rdf).toContain('<dc:identifier>https://example.org/identifier/project-1</dc:identifier>');
    expect(rdf).toContain('<rdf:Description rdf:about="https://example.org/hdt/project-1">');
    expect(rdf).toContain(`<${ECHOES_HDTO_CURIE_HP3_IS_DIGITAL_TWIN_COMPONENT_OF} rdf:resource="https://assets.example.org/id/model.glb"/>`);
    expect(rdf).toContain('<rdf:Description rdf:about="https://assets.example.org/id/model.glb">');
    expect(rdf).toContain('<dc:format>model/gltf-binary</dc:format>');
    expect(rdf).toContain(`<${ECHOES_HDTO_CURIE_HP21_IS_3D_REPRESENTATION_OUTPUT_OF} rdf:resource="https://example.org/heritage/project-1"/>`);
    expect(rdf).toContain('<ocra:hasProjectSnapshot rdf:resource="https://example.org/snapshots/project-1.json"/>');
    expect(rdf).toContain('<ocra:snapshotIncludesAnnotations>true</ocra:snapshotIncludesAnnotations>');
  });
});
