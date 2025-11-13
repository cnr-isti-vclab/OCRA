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
  console.log('🚀 [OAuth] Token exchange endpoint called');
  console.log('  Request body keys:', Object.keys(req.body));
  console.log('  Request headers:', req.headers);
  
  try {
    const { code, codeVerifier, redirectUri } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
      console.error('❌ [OAuth] Missing required parameters:', { 
        hasCode: !!code, 
        hasCodeVerifier: !!codeVerifier, 
        hasRedirectUri: !!redirectUri 
      });
      res.status(400).json({
        error: 'Missing required parameters',
        details: 'code, codeVerifier, and redirectUri are required'
      });
      return;
    }

    // Get OAuth configuration from environment
    const issuer = process.env.ISSUER;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET; // Optional for public clients

    if (!issuer || !clientId) {
      console.error('❌ [OAuth] Configuration missing:', { 
        issuer: !!issuer, 
        clientId: !!clientId 
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
    console.log('  Using client secret:', !!clientSecret);

    // Exchange code for tokens with OAuth provider (EGI)
    const tokenEndpoint = `${issuer}/protocol/openid-connect/token`;
    
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    });
    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams
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
    try {
      const tokenKeys = Object.keys(tokens || {});
      console.log('  Token keys:', tokenKeys.join(', '));
      if (tokens) {
        console.log('  token_type:', tokens.token_type, 'scope:', tokens.scope, 'expires_in:', tokens.expires_in);
      }
    } catch {}

    // Get user profile from access token
    const userInfoEndpoint = `${issuer}/protocol/openid-connect/userinfo`;
    let userProfile: any | null = null;
    try {
      const userInfoResponse = await fetch(userInfoEndpoint, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (userInfoResponse.ok) {
        userProfile = await userInfoResponse.json();
        console.log('✅ [OAuth] User profile retrieved:', userProfile.email || userProfile.sub);
      } else {
        const errorText = await userInfoResponse.text();
        console.warn('⚠️ [OAuth] Userinfo failed:', userInfoResponse.status, errorText);
      }
    } catch (e) {
      console.warn('⚠️ [OAuth] Userinfo request error:', e);
    }

    // Fallback: decode ID token if userinfo failed
    if (!userProfile && tokens?.id_token) {
      try {
        const parts = String(tokens.id_token).split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          userProfile = {
            sub: payload.sub,
            email: payload.email,
            name: payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(' '),
            given_name: payload.given_name,
            family_name: payload.family_name,
            preferred_username: payload.preferred_username,
            source: 'id_token'
          };
          console.log('✅ [OAuth] User profile derived from id_token:', userProfile.email || userProfile.sub);
        }
      } catch (e) {
        console.warn('⚠️ [OAuth] Failed to decode id_token for user profile:', e);
      }
    }

    if (!userProfile) {
      res.status(401).json({
        error: 'Failed to get user info',
        details: 'User info endpoint denied access and id_token did not contain usable claims.'
      });
      return;
    }

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
