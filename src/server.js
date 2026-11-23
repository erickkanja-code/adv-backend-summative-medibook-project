const app = require('./app');
const config = require('./config/env');
const db = require('./models/db');

const server = app.listen(config.port, () => {
  console.log(`[web] MediBook API listening on http://localhost:${config.port}`);
});

// Startup checks only warn: the server keeps running and requests that need a
// missing service get a 503 until it becomes available.
db.ping()
  .then(() => console.log('[web] connected to MySQL'))
  .catch((err) => console.warn(`[web] MySQL not reachable yet: ${err.code || err.message}`));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[web] ${signal} received, shutting down`);
  server.close();
  await db.close().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
