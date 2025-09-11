/**
 * Auth Controller
 * 
 * HTTP request handlers for authentication-related operations
 */

import { getUserAuditLog, testUserInfo } from '../services/auth.service.js';

/**
 * Get user's audit log
 */
export async function getAuditLog(req, res) {
  try {
    const { userSub } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const events = await getUserAuditLog(userSub, limit);
    res.json(events);
  } catch (error) {
    console.error('Failed to get audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
}

/**
 * Debug endpoint to test userinfo from Keycloak
 */
export async function debugUserInfo(req, res) {
  try {
    const { accessToken } = req.params;
    
    console.log('🔍 Testing userinfo endpoint with access token...');
    
    const result = await testUserInfo(accessToken);
    
    console.log('📋 Raw userinfo from Keycloak:', JSON.stringify(result.userinfo, null, 2));
    
    res.json(result);
  } catch (error) {
    console.error('Failed to get userinfo:', error);
    res.status(500).json({ error: 'Failed to get userinfo', details: error.message });
  }
}
