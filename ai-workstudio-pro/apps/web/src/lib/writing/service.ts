import { json, withTenant, type TenantContext, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { SaveDocumentInput } from "@workstudio/shared";

export interface StyleRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  is_default: boolean;
}

export async function listStyles(tx: Tx) {
  return tx<StyleRow[]>`select id, name, description, instructions, is_default from writing_styles order by is_default desc, name`;
}

export async function getUserPrefs(tx: Tx) {
  const [row] = await tx<{ instructions: string; default_style_id: string | null; default_language: string }[]>`
    select instructions, default_style_id, default_language from user_instructions where org_id = app_org_id() and user_id = app_user_id()`;
  return row ?? { instructions: "", default_style_id: null, default_language: "Nederlands" };
}

/** Systeeminstructies voor schrijfstijl + persoonlijke instructies van de gebruiker. */
export async function writingContext(tx: Tx, styleId: string | null): Promise<{ system: string; style: StyleRow | null }> {
  const prefs = await getUserPrefs(tx);
  const styles = await listStyles(tx);
  const style = styles.find((s) => s.id === (styleId ?? prefs.default_style_id)) ?? styles.find((s) => s.is_default) ?? null;
  const [org] = await tx<{ name: string; description: string }[]>`select name, description from organizations where id = app_org_id()`;
  const parts = [
    `Je werkt voor ${org.name}.${org.description ? ` Bedrijfsgegevens: ${org.description}` : ""}`,
    `Schrijf standaard in het ${prefs.default_language}, tenzij anders gevraagd.`,
    style ? `## Schrijfstijl: ${style.name}\n${style.instructions}` : "",
    prefs.instructions.trim() ? `## Persoonlijke instructies van de gebruiker\n${prefs.instructions.trim()}` : "",
  ];
  return { system: parts.filter(Boolean).join("\n\n"), style };
}

export async function saveDocument(ctx: TenantContext, input: SaveDocumentInput) {
  return withTenant(ctx, async (tx) => {
    const [doc] = await tx<{ id: string }[]>`
      insert into writing_documents (org_id, user_id, title, kind, content, metadata, shared, source_conversation_id)
      values (app_org_id(), app_user_id(), ${input.title}, ${input.kind}, ${input.content}, ${json(tx, input.metadata)}, ${input.shared},
              ${input.conversationId ?? null})
      returning id`;
    await tx`insert into writing_document_versions (org_id, document_id, version, title, content, note, created_by)
             values (app_org_id(), ${doc.id}, 1, ${input.title}, ${input.content}, 'Eerste versie', app_user_id())`;
    return doc.id;
  });
}

export async function updateDocument(ctx: TenantContext, id: string, input: { title?: string; content?: string; kind?: string; metadata?: Record<string, unknown>; status?: "draft" | "approved" | "archived"; shared?: boolean; versionNote?: string }) {
  return withTenant(ctx, async (tx) => {
    const [doc] = await tx<{ id: string; title: string; content: string; version: number; user_id: string }[]>`
      select id, title, content, version, user_id from writing_documents where id = ${id} for update`;
    if (!doc) throw new ApiError(404, "Document niet gevonden");
    const changed = (input.title !== undefined && input.title !== doc.title) || (input.content !== undefined && input.content !== doc.content);
    const version = changed ? doc.version + 1 : doc.version;
    const [updated] = await tx<{ id: string }[]>`
      update writing_documents set
        title = coalesce(${input.title ?? null}, title),
        content = coalesce(${input.content ?? null}, content),
        kind = coalesce(${input.kind ?? null}, kind),
        metadata = case when ${input.metadata !== undefined} then ${json(tx, input.metadata ?? {})} else metadata end,
        shared = coalesce(${input.shared ?? null}, shared),
        version = ${version},
        status = case when ${changed} and status = 'approved' then 'draft' else coalesce(${input.status ?? null}, status) end,
        approved_by = case when ${input.status === "approved"} then app_user_id() when ${changed} then null else approved_by end,
        approved_at = case when ${input.status === "approved"} then now() when ${changed} then null else approved_at end
      where id = ${id} returning id`;
    if (!updated) throw new ApiError(403, "Je mag dit document niet wijzigen");
    if (changed) {
      await tx`insert into writing_document_versions (org_id, document_id, version, title, content, note, created_by)
               values (app_org_id(), ${id}, ${version}, ${input.title ?? doc.title}, ${input.content ?? doc.content}, ${input.versionNote ?? ""}, app_user_id())`;
    }
    return { id, version, changed };
  });
}

/** Haalt "Onderwerp: …" uit een e-mailtekst. */
export function parseEmail(text: string): { subject: string; body: string } {
  const clean = text.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "").trim();
  const m = clean.match(/^\s*(?:\*\*)?(?:onderwerp|subject)(?:\*\*)?\s*:\s*(.+)\n+([\s\S]*)$/i);
  if (m) return { subject: m[1].replace(/\*\*/g, "").trim(), body: m[2].trim() };
  const firstLine = clean.split("\n")[0].slice(0, 120);
  return { subject: firstLine || "E-mail", body: clean };
}
