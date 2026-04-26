/**
 * Session Controller
 * 
 * HTTP request handlers for session management
 */

import express from 'express';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import { sendApiError } from '../lib/api-error.js';
import { createSession, getSession, removeSession } from '../services/session.service.js';
import { auditBestEffort } from '../utils/audit.js';
import { logLogin, logLogout } from '../services/auth.service.js';
import { CreateSessionRequest } from '../types/index.js';
import { USER_DISABLED_MESSAGE } from '../../db.js';

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

    // Audit log
    await auditBestEffort({
      req,
      userSub: userProfile?.sub ?? 'system',
      action: 'auth.login',
      success: true,
      payload: { sessionId }
    });

    // Set HTTP-only cookie for authentication
    // Cookie domain: undefined allows it to work on any domain (localhost, production, etc.)
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax', // Use lax for development
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
      // domain: omitted - browser will use current domain automatically
    });

    res.json({ sessionId });
  } catch (error) {
    console.error('Failed to create session:', error);

    const message = (error as Error).message;
    if (message.includes(USER_DISABLED_MESSAGE)) {
      sendApiError(req, res, {
        status: 403,
        code: API_ERROR_CODES.session.userDisabled,
        error: USER_DISABLED_MESSAGE,
      });
      return;
    }
    
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
    
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.session.createFailed,
      error: 'Failed to create session',
      details: message,
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
      sendApiError(req, res, {
        status: 400,
        code: API_ERROR_CODES.session.idRequired,
        error: 'Session ID required',
      });
      return;
    }

    const session = await getSession(sessionId);
    
    if (!session) {
      sendApiError(req, res, {
        status: 404,
        code: API_ERROR_CODES.session.notFound,
        error: 'Session not found or expired',
      });
      return;
    }

    res.json({ 
      user: session.user
    });
  } catch (error) {
    console.error('Failed to get session:', error);
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.session.getFailed,
      error: 'Failed to get session',
      details: (error as Error).message,
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
      sendApiError(req, res, {
        status: 400,
        code: API_ERROR_CODES.session.idRequired,
        error: 'Session ID required',
      });
      return;
    }

    // Get session info before deletion for logging
    const session = await getSession(sessionId);
    
    const success = await removeSession(sessionId);
    
    if (!success) {
      res.status(200).json({ success: true, message: 'Session already deleted' });
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
      
      // Audit log for logout
      await auditBestEffort({
        req,
        userSub: session.user.sub,
        action: 'auth.logout',
        success: true,
        payload: { sessionId }
      });
    }

    res.status(200).json({ success: true, message: 'Session deleted successfully' });
    
  } catch (error) {
    console.error('Failed to delete session:', error);
    
    // Log failed logout if we have session info
    if (req.params.sessionId) {
      await logLogout(
        req.params.sessionId,
        req.params.sessionId,
        req.headers['user-agent'] as string,
        req.ip || null
      );
    }
    
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.session.deleteFailed,
      error: 'Failed to delete session',
      details: (error as Error).message,
    });
  }
}

/**
 * Get current user information based on session
 */
export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.headers.authorization?.replace('Bearer ', '') || 
                     req.cookies.session_id ||
                     req.query.sessionId as string;

    if (!sessionId) {
      sendApiError(req, res, {
        status: 401,
        code: API_ERROR_CODES.session.noSessionProvided,
        error: 'No session provided',
      });
      return;
    }

    const session = await getSession(sessionId);
    
    if (!session) {
      sendApiError(req, res, {
        status: 401,
        code: API_ERROR_CODES.session.invalid,
        error: 'Invalid session',
      });
      return;
    }

    // Get user with their project roles
    const { getPrismaClient } = await import('../../db.js');
    const db = getPrismaClient();
    
    const user = await db.user.findUnique({
      where: { sub: session.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        given_name: true,
        family_name: true,
        sys_admin: true,
        sys_creator: true,
        projectRoles: {
          select: {
            role: true,
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      sendApiError(req, res, {
        status: 404,
        code: API_ERROR_CODES.session.userNotFound,
        error: 'User not found',
      });
      return;
    }

    // Extract managed projects
    const managedProjects = user.projectRoles
      .filter((pr: any) => pr.role === 'manager')
      .map((pr: any) => pr.project);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        displayName: user.name || 
                     `${user.given_name || ''} ${user.family_name || ''}`.trim() ||
                     user.username ||
                     'Unknown User',
        sys_admin: user.sys_admin,
        sys_creator: user.sys_creator,
        managedProjects
      }
    });
  } catch (error) {
    console.error('Failed to get current user:', error);
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.session.currentUserFailed,
      error: 'Failed to get current user',
      details: (error as Error).message,
    });
  }
}