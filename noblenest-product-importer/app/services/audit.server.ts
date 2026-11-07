import type { LogLevel, Prisma } from "@prisma/client";
import db from "../db.server";

export interface AuditEntry {
  shopId: string;
  actorUserId?: string | null;
  level?: LogLevel;
  action: string;
  entityType?: string;
  entityId?: string;
  message: string;
  /** Nooit geheimen (API-sleutels, tokens) in metadata opnemen. */
  metadata?: Prisma.InputJsonValue;
}

const SECRET_KEYS = /(api[_-]?key|secret|token|password|wachtwoord|credential)/i;

/** Verwijdert waarden van velden die op geheimen lijken (extra vangnet). */
export function redactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[verborgen]" : redactMetadata(v)]),
    );
  }
  return value;
}

export async function logAudit(entry: AuditEntry, client: Prisma.TransactionClient | typeof db = db) {
  await client.auditLog.create({
    data: {
      shopId: entry.shopId,
      actorUserId: entry.actorUserId ?? null,
      level: entry.level ?? "INFO",
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      message: entry.message,
      metadata: entry.metadata === undefined ? undefined : (redactMetadata(entry.metadata) as Prisma.InputJsonValue),
    },
  });
}
