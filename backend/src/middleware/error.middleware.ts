import { Request, Response, NextFunction } from 'express';
import { ApiError, sendApiError } from '../lib/api-error.js';

/**
 * Error Handling Middleware (TypeScript version)
 * 
 * Centralized error handling for the application
 */

/**
 * Global error handler
 */
export function errorHandler(
  error: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  console.error('Unhandled error:', error);

  if (error instanceof ApiError) {
    sendApiError(req, res, {
      status: error.status,
      code: error.code,
      error: error.message,
      details: error.details,
    });
    return;
  }

  if (error.name === 'ValidationError') {
    sendApiError(req, res, {
      status: 400,
      code: 'common.validation_error',
      error: 'Validation error',
      details: error.message,
    });
    return;
  }
  
  if (error.name === 'UnauthorizedError') {
    sendApiError(req, res, {
      status: 401,
      code: 'common.unauthorized',
      error: 'Unauthorized',
    });
    return;
  }

  sendApiError(req, res, {
    status: 500,
    code: 'common.internal_error',
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? { message: error.message, stack: error.stack } : undefined,
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendApiError(req, res, {
    status: 404,
    code: 'common.route_not_found',
    error: 'Not found',
    details: {
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}