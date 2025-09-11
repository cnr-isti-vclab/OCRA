/**
 * Session Controller
 * 
 * HTTP request handlers for session management
 */

import express from 'express';
import { createSession, getSession, removeSession } from '../services/session.service.js';
import { logLogin, logLogout } from '../services/auth.service.js';
import { CreateSessionRequest } from '../types/index.js';

type Request = express.Request;
type Response = express.Response;

/**
 * Create user session after OAuth token exchange
 */
export async function createUserSession(req: Request, res: Response): Promise<void> {
  try {
    const { userProfile, tokens }: CreateSessionRequest = req.body;

    // Debug: Log what profile information we received
    console.log('📋 Received user profile from OAuth provider:', JSON.stringify(userProfile, null, 2));

    const sessionId = await createSession(userProfile, tokens);
    
    // Log successful login
    await logLogin(
      userProfile?.sub || 'unknown',
      true,
      req.headers['user-agent'] as string,
      req.ip || null,
      sessionId
    );

    // Set HTTP-only cookie for authentication
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    res.json({ sessionId });
  } catch (error) {
    console.error('Failed to create session:', error);
    
    // Log failed login if we have user info
    if (req.body.userProfile?.sub) {
      await logLogin(
        req.body.userProfile.sub,
        false,
        req.headers['user-agent'] as string,
        req.ip || null,
        null
      );
    }
    
    res.status(500).json({ 
      error: 'Failed to create session',
      message: (error as Error).message 
    });
  }
}

/**
 * Get session info (validate and return user data)
 */
export async function getUserSession(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const session = await getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    res.json({ 
      user: session.user
    });
  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({ 
      error: 'Failed to get session',
      message: (error as Error).message 
    });
  }
}

/**
 * Delete session (logout)
 */
export async function deleteUserSession(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    // Get session info before deletion for logging
    const session = await getSession(sessionId);
    
    const success = await removeSession(sessionId);
    
    if (!success) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Log successful logout
    if (session?.user) {
      await logLogout(
        session.user.sub,
        sessionId,
        req.headers['user-agent'] as string,
        req.ip || null
      );
    }

    // Clear the session cookie
    res.clearCookie('session_id', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    });

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Failed to delete session:', error);
    
    // Log failed logout
    const session = await getSession(req.params.sessionId).catch(() => null);
    if (session?.user) {
      await logLogout(
        session.user.sub,
        req.params.sessionId,
        req.headers['user-agent'] as string,
        req.ip || null
      );
    }
    
    res.status(500).json({ 
      error: 'Failed to delete session',
      message: (error as Error).message 
    });
  }
}