/**
 * SIMPLE OAUTH SESSION BACKEND
 * 
 * A minimal Node.js/Express API that provides database-backed session management
 * for the React OAuth demo. This replaces the browser localStorage simulation
 * with proper server-side token storage.
 */

import express from 'express';
import cors from 'cors';
import { 
  createUserSession, 
  getValidSession, 
  deleteSession, 
  logLoginEvent,
  logLogoutEvent,
  getUserLoginHistory 
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'oauth-backend' });
});

// Create user session after OAuth token exchange
app.post('/api/sessions', async (req, res) => {
  try {
    const { userProfile, tokens } = req.body;
    
    if (!userProfile?.sub || !tokens?.access_token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sessionId = await createUserSession(userProfile, tokens);
    
    // Log successful login
    await logLoginEvent(
      userProfile.sub,
      true,
      req.headers['user-agent'],
      req.ip,
      'login',
      sessionId
    );

    res.json({ sessionId });
  } catch (error) {
    console.error('Failed to create session:', error);
    
    // Log failed login if we have user info
    if (req.body.userProfile?.sub) {
      await logLoginEvent(
        req.body.userProfile.sub,
        false,
        req.headers['user-agent'],
        req.ip,
        'login',
        undefined,
        error.message
      );
    }
    
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session info (validate and return user data)
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getValidSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    res.json({
      user: session.user,
      // Don't return the actual access token to frontend
      hasValidToken: !!session.accessToken
    });
  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Delete session (logout)
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get user info before deletion for logging
    const session = await getValidSession(sessionId);
    const userSub = session?.user.sub;
    
    await deleteSession(sessionId);
    
    // Log successful logout
    if (userSub) {
      await logLogoutEvent(
        userSub,
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
      const session = await getValidSession(req.params.sessionId);
      if (session?.user.sub) {
        await logLoginEvent(
          session.user.sub,
          false,
          req.headers['user-agent'],
          req.ip,
          'logout',
          req.params.sessionId,
          error.message
        );
      }
    }
    
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Get user's audit log
app.get('/api/users/:userSub/audit', async (req, res) => {
  try {
    const { userSub } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const events = await getUserLoginHistory(userSub, limit);
    res.json(events);
  } catch (error) {
    console.error('Failed to get audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OAuth Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
