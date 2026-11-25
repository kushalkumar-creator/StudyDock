import { createApp } from './app.js';
import { env } from './config/env.js';
import { startScheduledJobs } from './jobs/scheduler.js';

const app = createApp();

const server = app.listen(env.port, '0.0.0.0', () => {
  console.info(
    `[server] StudyDock API listening on http://0.0.0.0:${env.port} (CLIENT_URL=${env.clientUrl})`,
  );
  startScheduledJobs();
});

function shutdown(signal: string) {
  console.info(`[server] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
