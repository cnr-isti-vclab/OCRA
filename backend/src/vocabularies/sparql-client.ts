import { VocabularyUpstreamError } from './types.js';

export interface SparqlValue {
  type?: string;
  value?: string;
  'xml:lang'?: string;
}

export type SparqlBinding = Record<string, SparqlValue | undefined>;

interface SparqlJsonResponse {
  results?: {
    bindings?: SparqlBinding[];
  };
}

export interface SparqlClient {
  query(sparql: string): Promise<SparqlBinding[]>;
}

export interface GettySparqlClientOptions {
  endpoint: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
}

export class GettySparqlClient implements SparqlClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: GettySparqlClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async query(sparql: string): Promise<SparqlBinding[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const url = new URL(this.options.endpoint);
    url.searchParams.set('query', sparql);

    try {
      const response = await this.fetchImplementation(url, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': 'OCRA/1.0 Getty AAT vocabulary adapter',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new VocabularyUpstreamError(
          `Getty SPARQL endpoint returned HTTP ${response.status}`,
        );
      }

      let payload: SparqlJsonResponse;
      try {
        payload = await response.json() as SparqlJsonResponse;
      } catch (error) {
        throw new VocabularyUpstreamError('Getty SPARQL endpoint returned malformed JSON', false, {
          cause: error,
        });
      }
      if (!Array.isArray(payload.results?.bindings)) {
        throw new VocabularyUpstreamError('Getty SPARQL response has no bindings array');
      }
      return payload.results.bindings;
    } catch (error) {
      if (error instanceof VocabularyUpstreamError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new VocabularyUpstreamError('Getty SPARQL request timed out', true, { cause: error });
      }
      throw new VocabularyUpstreamError('Getty SPARQL request failed', false, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
