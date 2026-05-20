import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { verifyAccessToken } from "./auth.js";
import { logger } from "./logger.js";

// ─── Channel pub/sub ──────────────────────────────────────────────────────────
// Channel key → Set of active WebSocket clients subscribed to it

const channels = new Map<string, Set<WebSocket>>();

function subscribe(ws: WebSocket, channel: string): void {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(ws);
}

function unsubscribeAll(ws: WebSocket): void {
  for (const [, subs] of channels) subs.delete(ws);
}

export function publish(channel: string, event: string, data: unknown): void {
  const subs = channels.get(channel);
  if (!subs || subs.size === 0) return;

  const payload = JSON.stringify({ event, data, ts: Date.now() });
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload, (err) => {
        if (err) logger.warn({ err, channel, event }, "WS send error");
      });
    }
  }
}

// ─── Channel helpers (called from route handlers) ─────────────────────────────

/** Emit a store-scoped event: inventory change, new sale, clock in/out */
export function publishStore(storeUserId: string, event: string, data: unknown): void {
  publish(`store:${storeUserId}`, event, data);
}

/** Emit a platform-level event (superadmin dashboard) */
export function publishAdmin(event: string, data: unknown): void {
  publish("admin:platform", event, data);
}

// ─── Server setup ─────────────────────────────────────────────────────────────

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate via cookie or Authorization header
    const cookieHeader = req.headers.cookie ?? "";
    const tokenFromCookie = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("sh_access="))
      ?.split("=")[1]?.trim();

    const authHeader  = req.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = tokenFromCookie ?? bearerToken;

    if (!token) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    const { userId, role } = payload;

    // Auto-subscribe to own store channel
    if (role === "store_owner" || role === "business_owner") {
      subscribe(ws, `store:${userId}`);
    }
    if (role === "superadmin") {
      subscribe(ws, "admin:platform");
    }

    ws.on("message", (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; channel?: string };
        if (msg.type === "subscribe" && msg.channel) {
          // Only allow subscribing to own store channel or admin channels
          const allowed =
            msg.channel === `store:${userId}` ||
            (role === "superadmin" && msg.channel.startsWith("admin:"));
          if (allowed) subscribe(ws, msg.channel);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => unsubscribeAll(ws));

    // Send welcome ping
    ws.send(JSON.stringify({ event: "connected", data: { userId, role }, ts: Date.now() }));
  });

  logger.info("WebSocket server attached at /ws");
  return wss;
}
