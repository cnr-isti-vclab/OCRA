/**
 * Session Controller
 * 
 * HTTP request handlers for session management
 */

import { createSession, getSession, removeSession } from '../services/session.service.js';
import { logLogin, logLogout } from '../services/auth.service.js';

/**
 * Create user session after OAuth token exchange
 */
export async function createUserSession(req, res) {
  try {
    const { userProfile, tokens } = req.body;

    // Debug: Log what profile information we received
    console.log('📋 Received user profile from OAuth provider:', JSON.stringify(userProfile, null, 2));

    const sessionId = await createSession(userProfile, tokens);
    
    // Log successful login
    await logLogin(
      userProfile.sub,
      true,
      req.headers['user-agent'],
      req.ip,
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
        req.headers['user-agent'],
        req.ip,
        undefined,
        error.message
      );
    }
    
    res.status(500).json({ error: 'Failed to create session' });
  }
}

/**
 * Get session info (validate and return user data)
 */
export async function getUserSession(req, res) {
  try {
    const { sessionId } = req.params;
    
    const sessionData = await getSession(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    res.json(sessionData);
  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
}

/**
 * Delete session (logout)
 */
export async function deleteUserSession(req, res) {
  try {
    const { sessionId } = req.params;
    
    const result = await removeSession(sessionId);
    
    // Clear the session cookie
    res.clearCookie('session_id', {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      path: '/'
    });
    
    // Log successful logout
    if (result.userSub) {
      await logLogout(
        result.userSub,
        sessionId,
        req.headers['user-agent'],
        req.ip
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    
    // Log failed logout if we have session info
    if (req.params.sessionId) {
      try {
        const session = await getSession(req.params.sessionId);
        if (session?.user?.sub) {
          await logLogin(
            session.user.sub,
            false,
            req.headers['user-agent'],
            req.ip,
            'logout',
            req.params.sessionId,
            error.message
          );
        }
      } catch (logError) {
        console.error('Failed to log logout error:', logError);
      }
    }
    
    res.status(500).json({ error: 'Failed to delete session' });
  }
}
