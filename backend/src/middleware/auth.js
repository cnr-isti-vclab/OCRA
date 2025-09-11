/**
 * Authentication Middleware
 * 
 * Provides authentication verification for protected routes
 */

import { getValidSession } from '../../db.js';

/**
 * Middleware to require authentication
 * Checks for session cookie and validates it
 */
export async function requireAuth(req, res, next) {
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
      sessionId = req.query.session_id;
    }
    
    if (!sessionId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No session found'
      });
    }

    // Validate session
    const session = await getValidSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Invalid or expired session'
      });
    }

    // Add user info to request for use in controllers
    req.user = session.user;
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
export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'No user context found'
    });
  }

  if (!req.user.sys_admin) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Admin privileges required'
    });
  }

  next();
}
