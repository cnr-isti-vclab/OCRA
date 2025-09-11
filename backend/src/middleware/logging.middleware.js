/**
 * Logging Middleware
 * 
 * Request/response logging for the application
 */

/**
 * Log HTTP requests
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log request
  console.log(`📥 ${req.method} ${req.path} - ${req.ip} - ${req.headers['user-agent']}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    
    console.log(`📤 ${statusEmoji} ${status} ${req.method} ${req.path} - ${duration}ms`);
  });
  
  next();
}
