import type { Request } from "express";
import { db } from "@workspace/db";
import { auditLogs } from "@workspace/db/schema";
import { logger } from "./logger.js";

export interface AuditContext {
  req?: Request;
  actorId?: string;
  actorRole?: string;
  businessId?: string;
  storeUserId?: string;
}

export interface AuditEvent {
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget audit log write. Never throws — audit failures must not break the request.
export function logAudit(ctx: AuditContext, event: AuditEvent): void {
  const actorId     = ctx.actorId     ?? ctx.req?.userId;
  const actorRole   = ctx.actorRole   ?? ctx.req?.userRole;
  const businessId  = ctx.businessId  ?? ctx.req?.businessId;
  const storeUserId = ctx.storeUserId ?? ctx.req?.userId;

  const ipAddress = ctx.req
    ? (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? ctx.req.socket?.remoteAddress
    : undefined;

  const userAgent = ctx.req?.headers["user-agent"]?.slice(0, 500);

  db.insert(auditLogs)
    .values({
      actorId:      actorId     ?? null,
      actorRole:    actorRole   ?? null,
      businessId:   businessId  ?? null,
      storeUserId:  storeUserId ?? null,
      action:       event.action,
      resourceType: event.resourceType ?? null,
      resourceId:   event.resourceId   ?? null,
      oldValue:     event.oldValue     ?? null,
      newValue:     event.newValue     ?? null,
      ipAddress:    ipAddress          ?? null,
      userAgent:    userAgent          ?? null,
      metadata:     event.metadata     ?? null,
    })
    .catch((err: Error) => logger.error({ err, action: event.action }, "audit log write failed"));
}
