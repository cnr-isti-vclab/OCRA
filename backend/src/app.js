/**
 * Express Application Configuration
 * 
 * Main Express app setup with middleware and routes
 */

import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // Basic middleware
  app.use(cors());
  app.use(express.json());
  
  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api', routes);
  
  // Health check available at both /health and /api/health
  app.use('/health', healthRoutes);

  // Error handling
  app.use('*', notFoundHandler); // Handle unmatched routes
  app.use(errorHandler); // Global error handler

  return app;
}
