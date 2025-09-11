/**
 * Health Controller
 * 
 * HTTP request handlers for health check endpoints
 */

import express from 'express';
type Request = express.Request;
type Response = express.Response;

/**
 * Basic health check
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.json({ status: 'ok', service: 'backend' });
}