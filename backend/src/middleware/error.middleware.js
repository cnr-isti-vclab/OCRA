/**
 * Error Handling Middleware
 * 
 * Centralized error handling for the application
 */

/**
 * Global error handler
 */
export function errorHandler(error, req, res, next) {
  console.error('Unhandled error:', error);
  
  // Default error response
  const response = {
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path
  };
  
  // Add error details in development
  if (process.env.NODE_ENV === 'development') {
    response.details = error.message;
    response.stack = error.stack;
  }
  
  res.status(500).json(response);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
}
