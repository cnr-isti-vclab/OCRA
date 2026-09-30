import type { Request, Response } from 'express';
import { vocabularyService } from '../vocabularies/service.js';
import {
  VocabularyConceptNotFoundError,
  VocabularyInputError,
  VocabularyProviderNotFoundError,
  VocabularyUpstreamError,
} from '../vocabularies/types.js';

function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sendVocabularyError(error: unknown, res: Response): void {
  if (error instanceof VocabularyInputError) {
    res.status(400).json({ error: error.message, code: 'INVALID_VOCABULARY_REQUEST' });
    return;
  }
  if (error instanceof VocabularyProviderNotFoundError) {
    res.status(404).json({ error: error.message, code: 'VOCABULARY_PROVIDER_NOT_FOUND' });
    return;
  }
  if (error instanceof VocabularyConceptNotFoundError) {
    res.status(404).json({ error: error.message, code: 'VOCABULARY_CONCEPT_NOT_FOUND' });
    return;
  }
  if (error instanceof VocabularyUpstreamError) {
    console.error('[external-vocabulary] Provider request failed:', error);
    res.status(error.timedOut ? 504 : 502).json({
      error: error.timedOut
        ? 'The external vocabulary service timed out'
        : 'The external vocabulary service is unavailable',
      code: error.timedOut ? 'VOCABULARY_PROVIDER_TIMEOUT' : 'VOCABULARY_PROVIDER_UNAVAILABLE',
    });
    return;
  }

  console.error('[external-vocabulary] Unexpected failure:', error);
  res.status(500).json({ error: 'Failed to query vocabulary', code: 'VOCABULARY_ERROR' });
}

export function listExternalVocabularyProviders(_req: Request, res: Response): void {
  res.json({ providers: vocabularyService.listProviders() });
}

export async function searchExternalVocabulary(req: Request, res: Response): Promise<void> {
  try {
    const provider = vocabularyService.getProvider(req.params.providerId);
    const query = queryValue(req.query.q) ?? '';
    const language = queryValue(req.query.lang) ?? 'en';
    const rawLimit = queryValue(req.query.limit);
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    const results = await provider.search(query, { language, limit });
    res.json({ provider: provider.metadata, query, language, results });
  } catch (error) {
    sendVocabularyError(error, res);
  }
}

export async function getExternalVocabularyConcept(req: Request, res: Response): Promise<void> {
  try {
    const provider = vocabularyService.getProvider(req.params.providerId);
    const language = queryValue(req.query.lang) ?? 'en';
    const concept = await provider.getConcept(req.params.conceptId, { language });
    res.json({ provider: provider.metadata, concept });
  } catch (error) {
    sendVocabularyError(error, res);
  }
}

export async function getExternalVocabularyBroader(req: Request, res: Response): Promise<void> {
  try {
    const provider = vocabularyService.getProvider(req.params.providerId);
    const language = queryValue(req.query.lang) ?? 'en';
    const concepts = await provider.getBroaderConcepts(req.params.conceptId, { language });
    res.json({ provider: provider.metadata, concepts });
  } catch (error) {
    sendVocabularyError(error, res);
  }
}

export async function getExternalVocabularyNarrower(req: Request, res: Response): Promise<void> {
  try {
    const provider = vocabularyService.getProvider(req.params.providerId);
    const language = queryValue(req.query.lang) ?? 'en';
    const concepts = await provider.getNarrowerConcepts(req.params.conceptId, { language });
    res.json({ provider: provider.metadata, concepts });
  } catch (error) {
    sendVocabularyError(error, res);
  }
}
