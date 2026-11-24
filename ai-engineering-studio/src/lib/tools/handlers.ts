import postgres from "postgres";
import { json, withTenant, type TenantContext } from "@/lib/db";
import type { OrgRole } from "@/lib/auth/rbac";
import { roleRank } from "@/lib/auth/rbac";
import { buildKnowledgeContext, searchKnowledge } from "@/lib/rag/search";
import { assertSafeUrl } from "@/lib/security/ssrf";
import { calculate } from "@/lib/tools/calculator";
import { getIntegration, googleAccessToken } from "@/lib/tools/integrations";

export interface ToolRow {
  id: string;
  key: string;
  name: string;
  description: string;
  handler: string;
  category: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown> | null;
  config: Record<string, unknown>;
  credential_id: string | null;
  risk_level: "read" | "write" | "sensitive";
  requires_approval: boolean;
  min_role: OrgRole;
  is_enabled: boolean;
  timeout_ms: number;
}

export interface AgentPolicy {
  id: string;
  key: string;
  name: string;
  dataScopes: string[];
  clearance: OrgRole;
  toolKeys: string[];
  knowledgeBaseIds: string[];
}

export type ToolActor =
  | { type: "chat" | "user" | "app" | "workflow"; id?: string | null; knowledgeBaseIds?: string[] }
  | { type: "agent"; id: string; agent: AgentPolicy };

export interface HandlerArgs {
  ctx: TenantContext;
  role: OrgRole;
  tool: ToolRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any;
  actor: ToolActor;
  signal: AbortSignal;
}

export class ToolDenied extends Error {}

function checkScope(actor: ToolActor, collection: string) {
  if (actor.type !== "agent") return;
  const scopes = actor.agent.dataScopes;
  if (!scopes.includes("*") && !scopes.includes(collection)) {
    throw new ToolDenied(`${actor.agent.name} heeft geen toegang tot de collectie "${collection}". Toegestaan: ${scopes.join(", ") || "geen"}.`);
  }
}

async function fetchJson(url: string, init: RequestInit & { signal: AbortSignal }, label: string) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* tekst */
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body ? JSON.stringify(body).slice(0, 300) : String(text).slice(0, 300);
    throw new Error(`${label} gaf fout ${res.status}: ${msg}`);
  }
  return body as Record<string, unknown>;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function readOnlySql(query: string): string {
  const q = query.trim().replace(/;\s*$/, "");
  if (q.includes(";")) throw new ToolDenied("Slechts één SQL-statement toegestaan");
  if (!/^(select|with)\b/i.test(q)) throw new ToolDenied("Alleen SELECT-query's zijn toegestaan");
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|vacuum|lock|set|reset|pg_sleep)\b/i.test(q)) {
    throw new ToolDenied("Query bevat niet-toegestane sleutelwoorden");
  }
  return q;
}

type Handler = (a: HandlerArgs) => Promise<unknown>;

export const HANDLERS: Record<string, Handler> = {
  async knowledge_search({ ctx, input, actor }) {
    const kbIds = actor.type === "agent" ? actor.agent.knowledgeBaseIds : actor.knowledgeBaseIds;
    const hits = await searchKnowledge(ctx, {
      query: String(input.query),
      topK: input.top_k ?? 5,
      knowledgeBaseIds: kbIds?.length ? kbIds : undefined,
      maxRole: actor.type === "agent" ? actor.agent.clearance : undefined,
    });
    const { citations } = buildKnowledgeContext(hits);
    return {
      found: hits.length > 0,
      message: hits.length ? undefined : "Geen relevante informatie gevonden in de kennisbank. Verzin geen antwoord.",
      results: hits.map((h, i) => ({
        source: `Bron ${i + 1}`,
        title: h.title,
        page: h.page,
        document_id: h.documentId,
        similarity: h.vectorSimilarity === null ? null : Math.round(h.vectorSimilarity * 100) / 100,
        excerpt: h.content.slice(0, 1200),
      })),
      citations,
    };
  },

  async document_read({ ctx, input, actor }) {
    const maxChars = Math.min(Number(input.max_chars ?? 12000), 40000);
    const maxRank = actor.type === "agent" ? roleRank(actor.agent.clearance) : 100;
    return withTenant(ctx, async (tx) => {
      const [doc] = await tx<{ id: string; title: string; min_role: OrgRole; knowledge_base_id: string }[]>`
        select id, title, min_role, knowledge_base_id from documents where id = ${input.document_id}`;
      if (!doc) throw new ToolDenied("Document niet gevonden of geen toegang");
      if (roleRank(doc.min_role) > maxRank) throw new ToolDenied("De agent heeft onvoldoende bevoegdheid voor dit document");
      if (actor.type === "agent" && actor.agent.knowledgeBaseIds.length && !actor.agent.knowledgeBaseIds.includes(doc.knowledge_base_id)) {
        throw new ToolDenied("Dit document hoort niet bij de kennisbanken van deze agent");
      }
      const chunks = await tx<{ content: string }[]>`select content from document_chunks where document_id = ${doc.id} order by chunk_index`;
      const text = chunks.map((c) => c.content).join("\n\n");
      return { title: doc.title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
    });
  },

  async records_search({ ctx, input, actor }) {
    checkScope(actor, input.collection);
    const limit = Math.min(Number(input.limit ?? 20), 50);
    const q = input.query ? String(input.query).slice(0, 200) : null;
    const rows = await withTenant(ctx, (tx) => tx<{ id: string; title: string; status: string; data: unknown; is_demo: boolean; updated_at: Date }[]>`
      select id, title, status, data, is_demo, updated_at from records
       where collection = ${input.collection}
         and (${q}::text is null or title ilike ${"%" + (q ?? "") + "%"} or data::text ilike ${"%" + (q ?? "") + "%"}
              or to_tsvector('dutch', title || ' ' || data::text) @@ websearch_to_tsquery('dutch', ${q ?? ""}))
       order by updated_at desc limit ${limit}`);
    return { count: rows.length, records: rows };
  },

  async records_create({ ctx, input, actor }) {
    checkScope(actor, input.collection);
    const [row] = await withTenant(ctx, async (tx) => {
      const [org] = await tx<{ is_demo: boolean }[]>`select is_demo from organizations where id = app_org_id()`;
      return tx<{ id: string }[]>`
        insert into records (org_id, collection, title, data, is_demo, created_by_type, created_by_id)
        values (app_org_id(), ${input.collection}, ${String(input.title).slice(0, 200)}, ${json(tx, input.data ?? {})}, ${org.is_demo},
                ${actor.type === "agent" ? "agent" : actor.type === "workflow" ? "workflow" : actor.type === "app" ? "app" : "user"}, ${actor.id ?? null})
        returning id`;
    });
    return { id: row.id, collection: input.collection, status: "opgeslagen" };
  },

  async records_update({ ctx, input, actor }) {
    return withTenant(ctx, async (tx) => {
      const [rec] = await tx<{ collection: string }[]>`select collection from records where id = ${input.id}`;
      if (!rec) throw new ToolDenied("Record niet gevonden");
      checkScope(actor, rec.collection);
      await tx`update records set
                 title = coalesce(${input.title ?? null}, title),
                 status = coalesce(${input.status ?? null}, status),
                 data = data || ${json(tx, input.data ?? {})}
               where id = ${input.id}`;
      return { id: input.id, updated: true };
    });
  },

  async records_delete({ ctx, input, actor }) {
    return withTenant(ctx, async (tx) => {
      const [rec] = await tx<{ collection: string }[]>`select collection from records where id = ${input.id}`;
      if (!rec) throw new ToolDenied("Record niet gevonden");
      checkScope(actor, rec.collection);
      await tx`delete from records where id = ${input.id}`;
      return { deleted: true, reason: input.reason };
    });
  },

  async email_draft({ ctx, input, actor }) {
    checkScope(actor, "email_concepten");
    const [row] = await withTenant(ctx, async (tx) => {
      const [org] = await tx<{ is_demo: boolean }[]>`select is_demo from organizations where id = app_org_id()`;
      return tx<{ id: string }[]>`
        insert into records (org_id, collection, title, data, status, is_demo, created_by_type, created_by_id)
        values (app_org_id(), 'email_concepten', ${String(input.subject).slice(0, 200)},
                ${json(tx, { to: input.to, subject: input.subject, body: input.body })}, 'concept', ${org.is_demo},
                ${actor.type === "agent" ? "agent" : "user"}, ${actor.id ?? null})
        returning id`;
    });
    return { id: row.id, status: "concept opgeslagen – niet verzonden" };
  },

  async calculator({ input }) {
    return { expression: input.expression, result: calculate(String(input.expression)) };
  },

  async current_datetime() {
    const now = new Date();
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", ...o }).format(now);
    return {
      iso: now.toISOString(),
      date: fmt({ dateStyle: "full" }),
      time: fmt({ timeStyle: "short" }),
      weekday: fmt({ weekday: "long" }),
      week: isoWeek(now),
      timezone: "Europe/Amsterdam",
    };
  },

  async http_request({ ctx, input, tool, signal }) {
    const allowed = (tool.config.allowed_domains as string[] | undefined) ?? [];
    if (!allowed.length) throw new ToolDenied("Stel eerst toegestane domeinen in voor deze tool (Tools & Integraties).");
    const url = await assertSafeUrl(String(input.url), allowed);
    const headers: Record<string, string> = { Accept: "application/json, text/plain;q=0.8", "User-Agent": "AI-Engineering-Studio/1.0" };
    try {
      const integ = await getIntegration(ctx, "http", tool.credential_id);
      if (integ.secret.authorization) headers.Authorization = integ.secret.authorization;
    } catch {
      /* geen authenticatie ingesteld */
    }
    let body: string | undefined;
    if (input.body && input.method !== "GET") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(input.body);
    }
    const res = await fetch(url, { method: input.method, headers, body, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) return { status: res.status, body: "Doorverwijzing geblokkeerd om veiligheidsredenen", location: res.headers.get("location") };
    const reader = res.body?.getReader();
    let received = 0;
    const parts: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > 300_000) {
        await reader.cancel();
        break;
      }
      parts.push(value);
    }
    const text = Buffer.concat(parts).toString("utf8");
    let parsed: unknown = text.slice(0, 60_000);
    try {
      parsed = JSON.parse(text);
    } catch {
      /* geen JSON */
    }
    return { status: res.status, content_type: res.headers.get("content-type"), body: parsed, truncated: received > 300_000 };
  },

  async sql_query({ ctx, input, tool }) {
    const integ = await getIntegration(ctx, "sql", tool.credential_id);
    const query = readOnlySql(String(input.query));
    const client = postgres(integ.secret.connection_string, { max: 1, connect_timeout: 10, idle_timeout: 5, onnotice: () => {} });
    try {
      const rows = await client.begin("read only", async (tx) => {
        await tx.unsafe("set local statement_timeout = 10000");
        return tx.unsafe(`select * from (${query}) as q limit 200`);
      });
      return { row_count: rows.length, rows: rows.slice(0, 200) };
    } finally {
      await client.end({ timeout: 2 });
    }
  },

  async web_search({ ctx, input, tool, signal }) {
    const integ = await getIntegration(ctx, "exa", tool.credential_id);
    const data = await fetchJson("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": integ.secret.api_key },
      body: JSON.stringify({ query: String(input.query), type: "auto", numResults: Math.min(Number(input.num_results ?? 5), 10), contents: { highlights: true } }),
      signal,
    }, "Exa");
    const results = (data.results as { title?: string; url?: string; publishedDate?: string; highlights?: string[] }[] | undefined) ?? [];
    return { results: results.map((r) => ({ title: r.title, url: r.url, published: r.publishedDate, highlights: r.highlights?.slice(0, 3) })) };
  },

  async gmail_send({ ctx, input, signal }) {
    const token = await googleAccessToken(ctx);
    const subject = `=?UTF-8?B?${Buffer.from(String(input.subject)).toString("base64")}?=`;
    const mime = [`To: ${input.to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", String(input.body)].join("\r\n");
    const data = await fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
      signal,
    }, "Gmail");
    return { message_id: data.id, status: "verzonden" };
  },

  async gcal_list_events({ ctx, input, signal }) {
    const token = await googleAccessToken(ctx);
    const params = new URLSearchParams({ timeMin: new Date(input.from).toISOString(), timeMax: new Date(input.to).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" });
    const data = await fetchJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal }, "Google Agenda");
    const items = (data.items as { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }[]) ?? [];
    return { events: items.map((e) => ({ id: e.id, title: e.summary, start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date, location: e.location })) };
  },

  async gcal_create_event({ ctx, input, signal }) {
    const token = await googleAccessToken(ctx);
    const data = await fetchJson("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.title,
        location: input.location,
        description: input.description,
        start: { dateTime: new Date(input.start).toISOString(), timeZone: "Europe/Amsterdam" },
        end: { dateTime: new Date(input.end).toISOString(), timeZone: "Europe/Amsterdam" },
      }),
      signal,
    }, "Google Agenda");
    return { event_id: data.id, link: data.htmlLink };
  },

  async gdrive_search({ ctx, input, signal }) {
    const token = await googleAccessToken(ctx);
    const safe = String(input.query).replace(/['\\]/g, " ").slice(0, 100);
    const params = new URLSearchParams({ q: `name contains '${safe}' and trashed = false`, fields: "files(id,name,mimeType,modifiedTime,webViewLink)", pageSize: String(Math.min(Number(input.limit ?? 10), 25)) });
    const data = await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal }, "Google Drive");
    return { files: data.files ?? [] };
  },

  async shopify_orders({ ctx, input, tool, signal }) {
    const integ = await getIntegration(ctx, "shopify", tool.credential_id);
    const shop = String(integ.config.shop_domain ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) throw new ToolDenied("Ongeldig Shopify-winkeldomein in de integratie");
    const version = String(integ.config.api_version ?? "2026-07");
    const params = new URLSearchParams({ status: input.status ?? "any", limit: String(Math.min(Number(input.limit ?? 10), 50)), fields: "id,name,created_at,financial_status,fulfillment_status,total_price,currency,customer" });
    const data = await fetchJson(`https://${shop}/admin/api/${version}/orders.json?${params}`, { headers: { "X-Shopify-Access-Token": integ.secret.access_token }, signal }, "Shopify");
    return { orders: data.orders ?? [] };
  },

  async shopify_products({ ctx, input, tool, signal }) {
    const integ = await getIntegration(ctx, "shopify", tool.credential_id);
    const shop = String(integ.config.shop_domain ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) throw new ToolDenied("Ongeldig Shopify-winkeldomein in de integratie");
    const version = String(integ.config.api_version ?? "2026-07");
    const params = new URLSearchParams({ limit: String(Math.min(Number(input.limit ?? 10), 50)), fields: "id,title,status,variants,product_type,vendor" });
    if (input.query) params.set("title", String(input.query));
    const data = await fetchJson(`https://${shop}/admin/api/${version}/products.json?${params}`, { headers: { "X-Shopify-Access-Token": integ.secret.access_token }, signal }, "Shopify");
    return { products: data.products ?? [] };
  },

  async whatsapp_send({ ctx, input, tool, signal }) {
    const integ = await getIntegration(ctx, "whatsapp", tool.credential_id);
    const phoneId = String(integ.config.phone_number_id ?? "");
    if (!/^\d{5,20}$/.test(phoneId)) throw new ToolDenied("Ongeldig WhatsApp phone number ID in de integratie");
    const version = String(integ.config.graph_version ?? "v23.0");
    const data = await fetchJson(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.secret.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: input.to, type: "text", text: { body: input.message } }),
      signal,
    }, "WhatsApp");
    return { message_id: (data.messages as { id: string }[] | undefined)?.[0]?.id ?? null, status: "verzonden" };
  },

  async mcp({ ctx, input, tool }) {
    const { callMcpTool } = await import("@/lib/tools/mcp");
    return callMcpTool(ctx, tool, input);
  },
};
