import postgres from "postgres";
import { env } from "@/lib/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = postgres.Sql<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = postgres.TransactionSql<any>;

const globalForDb = globalThis as unknown as { __studioSql?: Sql };

/** Gedeelde connectiepool (één per proces, ook bij hot reload). */
export function db(): Sql {
  if (!globalForDb.__studioSql) {
    const e = env();
    globalForDb.__studioSql = postgres(e.DATABASE_URL, {
      max: e.DATABASE_POOL_MAX,
      prepare: e.DATABASE_PREPARE === "true",
      idle_timeout: 30,
      connect_timeout: 15,
      onnotice: () => {},
      transform: { undefined: null },
    });
  }
  return globalForDb.__studioSql;
}

export interface TenantContext {
  userId: string;
  orgId: string;
}

/**
 * Voert werk uit als de runtime-rol `studio_app` met tenantcontext.
 * Alle RLS-policies zijn hierbinnen actief: ook als applicatiecode een filter
 * vergeet, ziet zij niets van andere organisaties.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx.unsafe("set local role studio_app");
    await tx`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.org_id', ${ctx.orgId}, true)`;
    return fn(tx);
  })) as T;
}

/** Gebruikerscontext zonder organisatie (bijv. eigen workspaces opvragen). */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx.unsafe("set local role studio_app");
    await tx`select set_config('app.user_id', ${userId}, true), set_config('app.org_id', '', true)`;
    return fn(tx);
  })) as T;
}

/**
 * Systeemcontext (omzeilt RLS). Uitsluitend voor authenticatie, rate limiting,
 * de job-queue en seed/migraties.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => fn(tx))) as T;
}

export async function closeDb() {
  if (globalForDb.__studioSql) {
    await globalForDb.__studioSql.end({ timeout: 5 });
    globalForDb.__studioSql = undefined;
  }
}

/** JSON-waarde veilig doorgeven aan postgres.js (jsonb-kolommen). */
export function json(tx: Tx | Sql, value: unknown) {
  return tx.json(value as postgres.JSONValue);
}
