/**
 * Express Application Configuration
 * 
 * Main Express app setup with middleware and routes
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { randomUUID } from 'crypto';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { readinessCheck } from './controllers/health.controller.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { swaggerSpec } from './config/swagger.js';

type Express = express.Express;
type Request = express.Request;
type Response = express.Response;
type NextFunction = express.NextFunction;

function buildPublicOrigin(req: Request): string {
  const forwardedProtoHeader = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3002';
  return `${protocol}://${host}`;
}

function buildSwaggerSpecForRequest(req: Request) {
  return {
    ...swaggerSpec,
    servers: [
      {
        url: buildPublicOrigin(req),
        description: 'Current server',
      },
    ],
  };
}

// Extend Express Request interface to include cookies
declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      user?: import('./types/index.js').User;
      sessionId?: string;
      requestId?: string;
    }
  }
}

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Trust reverse proxy (nginx / traefik / docker)
  // Needed to get correct req.ip from X-Forwarded-For
  app.set('trust proxy', true);


  // CORS configuration - allow credentials for cookie-based auth
  // Get allowed origins from environment or use defaults
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3001'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  }));

  // Basic middleware
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const headerRequestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null;
    req.requestId = headerRequestId || randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

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

  // Swagger JSON spec
  app.get('/api-docs.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(buildSwaggerSpecForRequest(req));
  });

  // Swagger API Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(undefined, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'OCRA API Documentation',
    swaggerOptions: {
      url: '/api-docs.json',
      persistAuthorization: true,
      requestInterceptor: (request: { credentials?: string }) => {
        request.credentials = 'include';
        return request;
      },
    },
  }));

  // API routes
  app.use('/api', routes);

  // Health check available at both /health and /api/health
  app.use('/health', healthRoutes);
  app.get('/ready', readinessCheck);

  // NEW: serve all project files from a single mount point
  const projectFilesRoot = path.resolve(
    process.env.PROJECT_FILES_PATH || '/app/project_files'
  );

  // URL base (public) for everything stored on disk:
  // /assets/projects/<projectId>/{3d-model|rti|tmp}/...
  app.use('/assets/projects', express.static(projectFilesRoot));

  // use mounted health router for /health paths

  // (dev route dump removed)

  // Error handling
  app.use('*', notFoundHandler); // Handle unmatched routes
  app.use(errorHandler); // Global error handler

  return app;
}
