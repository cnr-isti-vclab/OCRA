import express, { type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchArco } from '../services/arco-search.service.js';

const router = express.Router();

router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }
  const offsetRaw = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  try {
    const results = await searchArco(q, offset);
    return res.json({ results });
  } catch (error: any) {
    console.error('ArCo search error:', error);
    return res.status(502).json({ error: error?.message || 'ArCo search failed' });
  }
});

export default router;
