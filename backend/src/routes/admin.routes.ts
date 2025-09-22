import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getRecentAuditEvents } from '../controllers/admin.controller.js';

const router = express.Router();

// GET /admin/audit - recent audit events (admin-only)
router.get('/audit', requireAuth, requireAdmin, getRecentAuditEvents);

export default router;
