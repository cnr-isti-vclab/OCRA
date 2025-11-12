/**
 * OAuth Controller
 * 
 * Handles OAuth token exchange securely on the backend
 * This is necessary because the client_secret must not be exposed to the frontend
 */

import { Request, Response } from 'express';

/**
 * Exchange authorization code for tokens (proxy to OAuth provider)
 * This keeps the CLIENT_SECRET secure on the backend
 */
export async function exchangeCodeForTokens(req: Request, res: Response): Promise<void> {
  try {
    const { code, codeVerifier, redirectUri } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
      res.status(400).json({
        error: 'Missing required parameters',
        details: 'code, codeVerifier, and redirectUri are required'
      });
      return;
    }

    // Get OAuth configuration from environment
    const issuer = process.env.ISSUER;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!issuer || !clientId || !clientSecret) {
      console.error('❌ [OAuth] Configuration missing:', { 
        issuer: !!issuer, 
        clientId: !!clientId, 
        clientSecret: !!clientSecret 
      });
      res.status(500).json({
        error: 'Server configuration error',
        details: 'OAuth provider not configured properly'
      });
      return;
    }

    console.log('🔐 [OAuth] Exchanging authorization code for tokens...');
    console.log('  Issuer:', issuer);
    console.log('  Client ID:', clientId);
    console.log('  Redirect URI:', redirectUri);

    // Exchange code for tokens with OAuth provider (EGI)
    const tokenEndpoint = `${issuer}/protocol/openid-connect/token`;
    
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret, // Secret stays on backend - never exposed to frontend!
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ [OAuth] Token exchange failed:', tokenResponse.status, errorText);
      res.status(tokenResponse.status).json({
        error: 'Token exchange failed',
        details: errorText
      });
      return;
    }

    const tokens = await tokenResponse.json();
    console.log('✅ [OAuth] Token exchange successful');

    // Get user profile from access token
    const userInfoEndpoint = `${issuer}/protocol/openid-connect/userinfo`;
    const userInfoResponse = await fetch(userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      console.error('❌ [OAuth] Failed to get user info:', userInfoResponse.status, errorText);
      res.status(userInfoResponse.status).json({
        error: 'Failed to get user info',
        details: errorText
      });
      return;
    }

    const userProfile = await userInfoResponse.json();
    console.log('✅ [OAuth] User profile retrieved:', userProfile.email || userProfile.sub);

    // Return both tokens and user profile
    res.json({
      tokens,
      userProfile
    });

  } catch (error) {
    console.error('❌ [OAuth] Error during token exchange:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
