import { json, type Tx } from "@/lib/db";

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  actorType?: "user" | "agent" | "system" | "app" | "workflow";
  actorLabel?: string;
  ip?: string | null;
}

/**
 * Schrijft een auditregel binnen de huidige tenanttransactie.
 * Org en gebruiker komen uit de RLS-context; gevoelige waarden worden gefilterd.
 */
export async function audit(tx: Tx, entry: AuditEntry) {
  const metadata = redact(entry.metadata ?? {});
  await tx`insert into audit_logs (org_id, actor_user_id, actor_type, actor_label, action, target_type, target_id, metadata, ip)
           values (app_org_id(), app_user_id(), ${entry.actorType ?? "user"}, ${entry.actorLabel ?? null}, ${entry.action},
                   ${entry.targetType ?? null}, ${entry.targetId ?? null}, ${json(tx, metadata)}, ${entry.ip ?? null})`;
}

const SECRET_KEYS = /(key|secret|token|password|authorization|credential)/i;

export function redact(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEYS.test(k)) out[k] = "[verborgen]";
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = redact(v as Record<string, unknown>);
    else if (typeof v === "string" && v.length > 2000) out[k] = v.slice(0, 2000) + "…";
    else out[k] = v;
  }
  return out;
}
