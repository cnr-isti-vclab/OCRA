import { afterEach, describe, expect, it, vi } from 'vitest';
import { WikidataPhysicalObjectImportAdapter } from './wikidata.adapter.js';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('WikidataPhysicalObjectImportAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('imports metadata from a Reasonator URL and maps key Dublin Core fields', async () => {
    const adapter = new WikidataPhysicalObjectImportAdapter();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q24628970: {
              id: 'Q24628970',
              labels: {
                it: { language: 'it', value: 'Leone che schiaccia un serpente' },
                en: { language: 'en', value: 'Lion crushing a serpent' }
              },
              descriptions: {
                it: { language: 'it', value: 'Scultura in marmo di ambito barocco' }
              },
              claims: {
                P170: [
                  {
                    mainsnak: {
                      snaktype: 'value',
                      datavalue: { value: { id: 'Q5598' } }
                    }
                  }
                ],
                P31: [
                  {
                    mainsnak: {
                      snaktype: 'value',
                      datavalue: { value: { id: 'Q860861' } }
                    }
                  }
                ],
                P571: [
                  {
                    mainsnak: {
                      snaktype: 'value',
                      datavalue: {
                        value: {
                          time: '+1880-00-00T00:00:00Z',
                          precision: 9
                        }
                      }
                    }
                  }
                ],
                P276: [
                  {
                    mainsnak: {
                      snaktype: 'value',
                      datavalue: { value: { id: 'Q220' } }
                    }
                  }
                ]
              }
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q5598: {
              labels: {
                it: { language: 'it', value: 'Gian Lorenzo Bernini' }
              }
            },
            Q860861: {
              labels: {
                it: { language: 'it', value: 'scultura' }
              }
            },
            Q220: {
              labels: {
                it: { language: 'it', value: 'Roma' }
              }
            }
          }
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.importMetadata({
      sourceUri: 'https://reasonator.toolforge.org/?q=Q24628970',
      payload: {
        language: 'it'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(result.dublinCore).toMatchObject({
      title: 'Leone che schiaccia un serpente',
      description: 'Scultura in marmo di ambito barocco',
      creator: 'Gian Lorenzo Bernini',
      type: 'scultura',
      coverage: 'Roma',
      date: '1880',
      identifier: 'Q24628970',
      source: 'https://www.wikidata.org/entity/Q24628970'
    });

    expect(result.sourceRecord).toMatchObject({
      qid: 'Q24628970',
      canonicalSourceUri: 'https://www.wikidata.org/entity/Q24628970'
    });

    expect(result.metadataPatch).toMatchObject({
      sourceUri: 'https://www.wikidata.org/entity/Q24628970',
      wikidata: {
        qid: 'Q24628970'
      }
    });
  });

  it('accepts direct QID input from payload', async () => {
    const adapter = new WikidataPhysicalObjectImportAdapter();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q123: {
              id: 'Q123',
              labels: {
                en: { language: 'en', value: 'Example entity' }
              },
              descriptions: {
                en: { language: 'en', value: 'Example description' }
              },
              claims: {}
            }
          }
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.importMetadata({
      sourceUri: 'urn:test:source',
      payload: {
        qid: 'Q123'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.dublinCore?.title).toBe('Example entity');
    expect(result.dublinCore?.identifier).toBe('Q123');
  });

  it('fails when no QID can be resolved', async () => {
    const adapter = new WikidataPhysicalObjectImportAdapter();

    await expect(
      adapter.importMetadata({
        sourceUri: 'https://example.org/no-qid-here'
      })
    ).rejects.toThrow('Wikidata import requires a valid QID');
  });
});
