import { describe, expect, it, vi } from 'vitest';
import { GettySparqlClient } from './sparql-client.js';
import { VocabularyUpstreamError } from './types.js';

describe('GettySparqlClient', () => {
  it('reports explicit remote HTTP failures', async () => {
    const fetchImplementation = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const client = new GettySparqlClient({
      endpoint: 'https://example.test/sparql',
      timeoutMs: 100,
      fetchImplementation,
    });

    await expect(client.query('SELECT * {}')).rejects.toMatchObject({
      name: 'VocabularyUpstreamError',
      timedOut: false,
    });
  });

  it('reports malformed Getty responses', async () => {
    const fetchImplementation = vi.fn(async () => new Response('{', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = new GettySparqlClient({
      endpoint: 'https://example.test/sparql',
      timeoutMs: 100,
      fetchImplementation,
    });

    await expect(client.query('SELECT * {}')).rejects.toBeInstanceOf(VocabularyUpstreamError);
  });

  it('aborts and identifies slow remote requests as timeouts', async () => {
    const fetchImplementation = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }));
    const client = new GettySparqlClient({
      endpoint: 'https://example.test/sparql',
      timeoutMs: 5,
      fetchImplementation,
    });

    await expect(client.query('SELECT * {}')).rejects.toMatchObject({
      timedOut: true,
    });
  });
});
