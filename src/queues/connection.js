const IORedis = require('ioredis');
const config = require('../config/env');

const ERROR_LOG_INTERVAL_MS = 10000;

/**
 * Connection options for each role:
 *  - 'worker':   BullMQ workers block waiting for jobs and require maxRetriesPerRequest: null.
 *  - 'producer': web requests should fail fast (one retry) instead of hanging when Redis is down.
 */
function redisOptions(role) {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
  };
}

function createRedisConnection(role) {
  const connection = new IORedis(redisOptions(role));
  let lastLoggedAt = 0;
  connection.on('error', (err) => {
    // ioredis keeps reconnecting on its own; throttle the log so it is readable.
    if (Date.now() - lastLoggedAt > ERROR_LOG_INTERVAL_MS) {
      lastLoggedAt = Date.now();
      console.error(`[redis] ${err.message}`);
    }
  });
  return connection;
}

// One shared connection per process for queue producers and the waitlist store.
// Created lazily so importing a module never opens a socket (keeps unit tests offline).
let producerConnection = null;

function getProducerConnection() {
  if (!producerConnection) {
    producerConnection = createRedisConnection('producer');
  }
  return producerConnection;
}

async function closeProducerConnection() {
  if (producerConnection) {
    await producerConnection.quit().catch(() => producerConnection.disconnect());
    producerConnection = null;
  }
}

module.exports = { redisOptions, createRedisConnection, getProducerConnection, closeProducerConnection };
