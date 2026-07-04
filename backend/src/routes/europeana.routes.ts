import express, { type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  EUROPEANA_PAGE_SIZE,
  getEuropeanaRecordDetail,
  searchEuropeana,
} from '../services/europeana-search.service.js';

const router = express.Router();

router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  const offsetRaw = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  try {
    const results = await searchEuropeana(q, offset);
    return res.json({
      results,
      pageSize: EUROPEANA_PAGE_SIZE,
    });
  } catch (error: unknown) {
    console.error('Europeana search error:', error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Europeana search failed',
    });
  }
});

router.get('/detail', requireAuth, async (req: Request, res: Response) => {
  const uri = typeof req.query.uri === 'string' ? req.query.uri.trim() : '';
  if (!uri) {
    return res.status(400).json({ error: 'Missing query parameter: uri' });
  }

  try {
    const detail = await getEuropeanaRecordDetail(uri);
    if (!detail) {
      return res.status(404).json({ error: 'Europeana record not found' });
    }
    return res.json({ detail });
  } catch (error: unknown) {
    console.error('Europeana detail error:', error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Europeana detail failed',
    });
  }
});

export default router;
