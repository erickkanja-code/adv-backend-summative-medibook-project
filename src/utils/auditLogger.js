const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');

// Relative paths are resolved from the project root; absolute paths are used as-is.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOG_FILE = path.resolve(PROJECT_ROOT, config.auditLogPath);

let directoryReady = null;

// Creates logs/ on first use (async, recursive = no error if it already exists).
// The promise is cached so the mkdir runs once, and reset if it fails.
function ensureLogDirectory() {
  if (!directoryReady) {
    directoryReady = fs.mkdir(path.dirname(LOG_FILE), { recursive: true }).catch((err) => {
      directoryReady = null;
      throw err;
    });
  }
  return directoryReady;
}

/**
 * Appends one JSON line to the audit log. Throws on failure - used by the
 * worker, where a failed write should make the job retry.
 */
async function appendAuditEntry(event, data = {}) {
  const line = `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...data })}\n`;
  await ensureLogDirectory();
  try {
    await fs.appendFile(LOG_FILE, line, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // logs/ was removed while running: recreate it once and retry.
    directoryReady = null;
    await ensureLogDirectory();
    await fs.appendFile(LOG_FILE, line, 'utf8');
  }
}

/**
 * Safe version for request handlers: never throws, so a logging failure
 * can never fail the user's booking or cancellation.
 */
async function logAudit(event, data) {
  try {
    await appendAuditEntry(event, data);
  } catch (err) {
    console.error(`[audit] could not write ${event} to ${LOG_FILE}: ${err.message}`);
  }
}

module.exports = { logAudit, appendAuditEntry, ensureLogDirectory, LOG_FILE };
