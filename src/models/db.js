const mysql = require('mysql2/promise');
const config = require('../config/env');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  // DATETIME columns come back as 'YYYY-MM-DD HH:MM:SS' strings, so no
  // time-zone conversion happens between MySQL and Node.
  dateStrings: true,
  // DECIMAL columns come back as JS numbers (money values fit safely).
  decimalNumbers: true,
});

const ISOLATION_LEVELS = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);

// Runs a parameterized statement. Values are always sent separately from the
// SQL text (prepared statement), so user input can never change the query.
async function query(sql, params = [], conn = null) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

// Runs `work(conn)` inside a transaction: commit on success, rollback on any error.
async function withTransaction(work, { isolationLevel } = {}) {
  const conn = await pool.getConnection();
  try {
    if (isolationLevel) {
      if (!ISOLATION_LEVELS.has(isolationLevel)) {
        throw new Error(`Unsupported isolation level: ${isolationLevel}`);
      }
      // Whitelisted constant above, never user input.
      await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    }
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// Builds "col_a = ?, col_b = ?" for a partial update. Column names come only
// from the model's fixed whitelist (never from user input); values stay as ? params.
function buildSetClause(columnMap, changes) {
  const entries = Object.entries(changes).filter(([field]) => columnMap[field]);
  return {
    clause: entries.map(([field]) => `${columnMap[field]} = ?`).join(', '),
    values: entries.map(([, value]) => value),
  };
}

async function ping() {
  await pool.query('SELECT 1');
}

async function close() {
  await pool.end();
}

module.exports = { query, withTransaction, buildSetClause, ping, close };
