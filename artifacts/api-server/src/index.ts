import http from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { attachWebSocket } from "./lib/websocket.js";
import { startWorkers } from "./lib/queue.js";
import { getRedis } from "./lib/redis.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Attach WebSocket server on /ws
attachWebSocket(server);

// Start BullMQ workers (email, reports, scheduled jobs)
startWorkers();

// Warm up Redis connection
getRedis().connect().catch(() => {
  // Redis connection failure is non-fatal — app continues with in-memory fallback
  logger.warn("Redis unavailable — rate limiting and queues will use fallbacks");
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});
