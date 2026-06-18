/**
 * Server Entry Point
 *
 * Main server startup with the restructured application
 */

import 'dotenv/config';
import { createApp } from './src/app.js';
import { getBackendReadinessReport } from './src/lib/readiness.js';

const PORT = process.env.PORT || 3002;

function logReadinessFailure(readiness: Awaited<ReturnType<typeof getBackendReadinessReport>>): void {
  console.error('❌ Backend startup aborted: required dependencies are not ready.');

  for (const [serviceName, status] of Object.entries(readiness.checks)) {
    if (status.ready) {
      console.error(`  - ${serviceName}: ready (${status.latencyMs ?? 0} ms)`);
      continue;
    }

    const details = status.error ? ` - ${status.error}` : '';
    console.error(`  - ${serviceName}: not ready${details}`);
  }
}

async function startServer(): Promise<void> {
  const readiness = await getBackendReadinessReport();

  if (!readiness.ready) {
    logReadinessFailure(readiness);
    process.exit(1);
  }

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`🚀 OAuth Backend running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🟢 Readiness check: http://localhost:${PORT}/health/ready`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`🏗️ Restructured backend with modular architecture`);
  });
}

void startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('❌ Backend startup failed unexpectedly.');
  console.error(message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
