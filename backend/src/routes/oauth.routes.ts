/**
 * OAuth Routes
 * 
 * Routes for secure OAuth token exchange on the backend
 */

import express from 'express';
import { exchangeCodeForTokens } from '../controllers/oauth.controller.js';

const router = express.Router();

/**
 * @swagger
 * /oauth/token:
 *   post:
 *     summary: Exchange authorization code for tokens (backend proxy)
 *     description: |
 *       Securely exchanges an OAuth authorization code for access tokens.
 *       This endpoint proxies the request to the OAuth provider (EGI) and includes
 *       the client_secret which must be kept confidential on the backend.
 *     tags:
 *       - OAuth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - codeVerifier
 *               - redirectUri
 *             properties:
 *               code:
 *                 type: string
 *                 description: Authorization code from OAuth provider
 *               codeVerifier:
 *                 type: string
 *                 description: PKCE code verifier
 *               redirectUri:
 *                 type: string
 *                 description: Redirect URI used in authorization request
 *     responses:
 *       200:
 *         description: Token exchange successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: object
 *                   properties:
 *                     access_token:
 *                       type: string
 *                     refresh_token:
 *                       type: string
 *                     id_token:
 *                       type: string
 *                     expires_in:
 *                       type: number
 *                 userProfile:
 *                   type: object
 *                   properties:
 *                     sub:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Server error or OAuth provider error
 */
router.post('/token', exchangeCodeForTokens);

export default router;
