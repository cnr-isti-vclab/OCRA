/**
 * Express Application Configuration
 * 
 * Main Express app setup with middleware and routes
 */

import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { connect } from './services/audit.service.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

type Express = express.Express;
type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

// Extend Express Request interface to include cookies
declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      user?: import('./types/index.js').User;
      sessionId?: string;
    }
  }
}

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // CORS configuration - allow credentials for cookie-based auth
  app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  }));

  // Basic middleware
  app.use(express.json());

  // (mongo debug route removed)
  
  // Simple cookie parser middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie: string) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          req.cookies![name] = decodeURIComponent(value);
        }
      });
    }
    next();
  });
  
  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api', routes);
  
  // Health check available at both /health and /api/health
  app.use('/health', healthRoutes);

  // use mounted health router for /health paths

  // (dev route dump removed)

  // Error handling
  app.use('*', notFoundHandler); // Handle unmatched routes
  app.use(errorHandler); // Global error handler

  return app;
}