/**
 * @spike feature/vocabulary-color-spike
 *
 * Read-only endpoint that exposes the TTL-based OCRA vocabulary concepts.
 * Remove this route (and its mount in index.ts) once vocabulary data is
 * managed through the database.
 *
 * GET /api/vocabulary/concepts
 *   Returns: {
 *     schemes: VocabularyScheme[],
 *     concepts: VocabularyConcept[],
 *     properties: VocabularyProperty[]
 *   }
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadVocabularyData } from '../lib/vocabulary-loader.js';

const router = Router();

router.get('/concepts', (_req: Request, res: Response) => {
  try {
    const data = loadVocabularyData();
    res.json(data);
  } catch (err) {
    console.error('[vocabulary-concepts] Failed to load vocabulary data:', err);
    res.status(500).json({ error: 'Failed to load vocabulary data' });
  }
});

export default router;
