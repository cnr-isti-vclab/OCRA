/**
 * Authentication Middleware
 * 
 * Provides authentication verification for protected routes
 */

import express from 'express';
import { getValidSession } from '../../db.js';
import { User, Session } from '../types/index.js';

type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

/**
 * Middleware to require authentication
 * Checks for session cookie and validates it
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get session ID from cookie first, then fall back to header or URL param for backward compatibility
    let sessionId = req.cookies?.session_id;
    
    // Fallback: check Authorization header
    if (!sessionId && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7);
      }
    }
    
    // Fallback: check for session_id in query params (for existing API calls)
    if (!sessionId && req.query.session_id) {
      sessionId = req.query.session_id as string;
    }
    
    if (!sessionId) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'No session found'
      });
      return;
    }

    // Validate session
    const session = await getValidSession(sessionId);
    
    if (!session) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'Invalid or expired session'
      });
      return;
    }

    // Add user info to request for use in controllers
    // Ensure user object has internal DB id
    const db = await import('../../db.js');
    const prisma = db.getPrismaClient();
    const dbUser = await prisma.user.findUnique({ where: { sub: session.user.sub } });
    if (!dbUser) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'User not found in database'
      });
      return;
    }
    req.user = { ...session.user, id: dbUser.id };
    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      message: 'Failed to verify authentication'
    });
  }
}

/**
 * Middleware to require admin privileges
 * Must be used after requireAuth
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ 
      error: 'Authentication required',
      message: 'No user context found'
    });
    return;
  }

  if (!req.user.sys_admin) {
    res.status(403).json({ 
      error: 'Access denied',
      message: 'Admin privileges required'
    });
    return;
  }

  next();
}