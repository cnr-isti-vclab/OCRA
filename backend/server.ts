/**
 * Server Entry Point
 * 
 * Main server startup with the restructured application
 */

import 'dotenv/config';
import { createApp } from './src/app.js';

const PORT = process.env.PORT || 3002;

// Create and start the application
const app = createApp();

app.listen(PORT, () => {
  console.log(`🚀 OAuth Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🏗️ Restructured backend with modular architecture`);
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