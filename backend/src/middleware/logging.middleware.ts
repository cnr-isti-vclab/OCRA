import { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../services/metrics.service.js';

/**
 * Logging Middleware (TypeScript version)
 * 
 * Request/response logging for the application
 */

/**
 * Log HTTP requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Log request
  console.log(`📥 ${req.method} ${req.path} - ${req.ip} - ${req.headers['user-agent']}`);
  
  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = function(...args: any[]) {
    const duration = Date.now() - start;
    const statusEmoji = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';
    console.log(`📤 ${statusEmoji} ${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
    recordHttpRequest(req, res.statusCode, duration);
    
    // Call original end method
    return originalEnd(...args);
  };
  
  next();
}