import express, { type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  WIKIDATA_PAGE_SIZE,
  getWikidataRecordDetail,
  searchWikidata,
} from '../services/wikidata-search.service.js';

const router = express.Router();
const QID_PATTERN = /^Q[1-9]\d*$/i;

router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const language = typeof req.query.language === 'string' ? req.query.language : 'it';
  try {
    const results = await searchWikidata(q, offset, language);
    return res.json({ results, pageSize: WIKIDATA_PAGE_SIZE });
  } catch (error: unknown) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Wikidata search failed' });
  }
});

router.get('/detail', requireAuth, async (req: Request, res: Response) => {
  const qid = typeof req.query.qid === 'string' ? req.query.qid.trim().toUpperCase() : '';
  if (!QID_PATTERN.test(qid)) return res.status(400).json({ error: 'Missing or invalid query parameter: qid' });
  const language = typeof req.query.language === 'string' ? req.query.language : 'it';
  try {
    const detail = await getWikidataRecordDetail(qid, language);
    if (!detail) return res.status(404).json({ error: 'Wikidata entity not found' });
    return res.json({ detail });
  } catch (error: unknown) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Wikidata detail failed' });
  }
});

export default router;
