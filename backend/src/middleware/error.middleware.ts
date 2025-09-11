import { Request, Response, NextFunction } from 'express';

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
  
  // Default error response
  const response: any = {
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };
  
  // Add error details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = error.message;
    response.stack = error.stack;
  }
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      ...response,
      error: 'Validation error',
      details: error.message,
    });
    return;
  }
  
  if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      ...response,
      error: 'Unauthorized',
    });
    return;
  }
  
  // Default server error
  res.status(500).json(response);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });
}