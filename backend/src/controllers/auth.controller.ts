/**
 * AUTH CONTROLLER (TypeScript version)
 * 
 * Handles authentication-related audit endpoints.
 */

import { Request, Response } from 'express';
import { getUserAuditLog, getFullAuditLog } from '../services/auth.service.js';

/**
 * Get audit log for a specific user
 */
export async function getAuditLog(req: Request, res: Response): Promise<void> {
  try {
    const { userSub } = req.params;
    
    if (!userSub) {
      res.status(400).json({
        error: 'User subject (userSub) is required'
      });
      return;
    }

    // Ensure only the requested user or a sys_admin can fetch this data
    const limit = Math.min(100, parseInt((req.query.limit as string) || '20', 10));
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.sub !== userSub && !req.user.sys_admin) {
      res.status(403).json({ error: 'Not authorized to access this audit log' });
      return;
    }

  const raw = await getUserAuditLog(userSub, limit);
  const auditLog: any[] = Array.isArray(raw) ? raw : [];

  res.json({ success: true, userSub, auditLog });
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({
      error: 'Failed to retrieve audit log',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get full audit log for all users (admin only)
 */
export async function getFullAuditLogController(req: Request, res: Response): Promise<void> {
  try {
    // Check if user is authenticated and is admin
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    if (!req.user.sys_admin) {
      res.status(403).json({
        error: 'Admin privileges required'
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const raw = await getFullAuditLog(limit);
    const auditLog: any[] = Array.isArray(raw) ? raw : [];

    res.json({
      success: true,
      totalEvents: auditLog.length,
      auditLog
    });
  } catch (error) {
    console.error('Error getting full audit log:', error);
    res.status(500).json({
      error: 'Failed to retrieve full audit log',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
