/**
 * Opgeslagen feedbronnen (XML/JSON-feed-URL's van leveranciers).
 *
 * - De feed-URL wordt versleuteld opgeslagen (URL's bevatten vaak toegangstokens) en nooit
 *   naar de browser gestuurd; in de interface staat alleen host + pad.
 * - Ophalen gaat altijd via safeFetchText (SSRF-bescherming, grootte- en tijdslimiet).
 * - Ingelezen catalogi worden 10 minuten in het geheugen bewaard voor Producten zoeken.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import db from "../db.server";
import { parseSource, SUPPLIER_KEY_FOR_FORMAT, type SourceFormat } from "../lib/import/sources";
import { SOURCE_LABEL_PATTERN } from "../lib/import/normalize";
import type { ParseResult } from "../lib/import/types";
import { decryptSecret, encryptSecret } from "../lib/security/crypto.server";
import { assertSafeUrl, displayUrl, safeFetchText, SafeFetchError, type SafeFetchOptions } from "../lib/security/safe-fetch.server";
import { logAudit } from "./audit.server";
import { ensureSupplierRegistry } from "./suppliers.server";

export const feedSourceFormSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(80),
  format: z.enum(["XML", "JSON"]),
  url: z.string().trim().min(1, "Feed-URL is verplicht").max(2000),
  label: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || SOURCE_LABEL_PATTERN.test(s), "Bronlabel: alleen kleine letters, cijfers en streepjes (max. 40)"),
  imageRights: z.boolean(),
});
export type FeedSourceForm = z.infer<typeof feedSourceFormSchema>;

export interface FeedConfig {
  format: SourceFormat;
  label: string | null;
  imageRights: boolean;
  host: string;
  productCount?: number;
  errorCount?: number;
}

const aadFor = (shopId: string, id: string) => `${shopId}:supplierConnection:${id}`;

function maxFeedBytes() {
  const mb = Number(process.env.NOBLENEST_MAX_FEED_MB ?? 20);
  return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
}

export async function listFeedSources(shopId: string) {
  const rows = await db.supplierConnection.findMany({
    where: { shopId, supplier: { type: "FEED" } },
    include: { supplier: { select: { key: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const config = r.config as unknown as FeedConfig;
    return {
      id: r.id,
      name: r.name,
      supplierName: r.supplier.name,
      format: config.format,
      label: config.label,
      imageRights: config.imageRights,
      host: config.host,
      productCount: config.productCount ?? null,
      errorCount: config.errorCount ?? null,
      status: r.status,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      lastError: r.lastError,
    };
  });
}

export async function createFeedSource(shopId: string, form: FeedSourceForm, userId: string | null) {
  const url = assertSafeUrl(form.url).toString();
  await ensureSupplierRegistry();
  const supplier = await db.supplier.findUniqueOrThrow({ where: { key: SUPPLIER_KEY_FOR_FORMAT[form.format] } });
  const exists = await db.supplierConnection.findFirst({ where: { shopId, supplierId: supplier.id, name: form.name } });
  if (exists) throw new Error("Er bestaat al een feedbron met deze naam.");

  const id = `fs_${randomUUID().replace(/-/g, "")}`;
  const config: FeedConfig = { format: form.format, label: form.label, imageRights: form.imageRights, host: displayUrl(url) };
  const row = await db.supplierConnection.create({
    data: {
      id,
      shopId,
      supplierId: supplier.id,
      name: form.name,
      status: "NOT_CONFIGURED",
      credentialsEncrypted: encryptSecret(JSON.stringify({ url }), aadFor(shopId, id)),
      config: config as object,
    },
  });
  await logAudit({
    shopId,
    actorUserId: userId,
    action: "feed.source.created",
    entityType: "SupplierConnection",
    entityId: row.id,
    message: `Feedbron "${form.name}" (${form.format}, ${config.host}) toegevoegd; URL versleuteld opgeslagen.`,
  });
  return row;
}

export async function deleteFeedSource(shopId: string, id: string, userId: string | null) {
  const row = await db.supplierConnection.findFirst({ where: { id, shopId } });
  if (!row) throw new Error("Feedbron niet gevonden");
  await db.supplierConnection.delete({ where: { id: row.id } });
  catalogCache.delete(`${shopId}:${id}`);
  await logAudit({ shopId, actorUserId: userId, action: "feed.source.deleted", entityType: "SupplierConnection", entityId: id, message: `Feedbron "${row.name}" verwijderd.` });
}

interface LoadOptions {
  defaultCurrency: string;
  fetchOptions?: Pick<SafeFetchOptions, "fetchImpl" | "resolver" | "timeoutMs">;
}

const catalogCache = new Map<string, { parsed: ParseResult; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Haalt de feed veilig op en leest hem in. Werkt de status van de bron bij. */
export async function loadFeedSource(shopId: string, id: string, options: LoadOptions) {
  const row = await db.supplierConnection.findFirst({ where: { id, shopId }, include: { supplier: true } });
  if (!row || row.supplier.type !== "FEED" || !row.credentialsEncrypted) throw new Error("Feedbron niet gevonden");
  const config = row.config as unknown as FeedConfig;
  const { url } = JSON.parse(decryptSecret(row.credentialsEncrypted, aadFor(shopId, id))) as { url: string };

  try {
    const fetched = await safeFetchText(url, { maxBytes: maxFeedBytes(), ...options.fetchOptions });
    const parsed = parseSource(config.format, fetched.text, {
      supplierKey: row.supplier.key,
      defaultCurrency: options.defaultCurrency,
      idPrefix: config.label,
      imageRightsFromSupplier: config.imageRights,
      maxRows: Number(process.env.NOBLENEST_MAX_ROWS ?? 5000),
    });
    const ok = parsed.products.length > 0;
    await db.supplierConnection.update({
      where: { id: row.id },
      data: {
        status: ok ? "CONNECTED" : "ERROR",
        lastCheckedAt: new Date(),
        lastError: ok ? null : parsed.errors[0]?.message ?? "Geen producten gevonden in de feed.",
        config: { ...config, productCount: parsed.products.length, errorCount: parsed.errors.length } as object,
      },
    });
    catalogCache.set(`${shopId}:${id}`, { parsed, fetchedAt: Date.now() });
    return { source: row, config, parsed };
  } catch (error) {
    const message = error instanceof SafeFetchError ? error.message : `Ophalen mislukt: ${error instanceof Error ? error.message : String(error)}`;
    await db.supplierConnection.update({ where: { id: row.id }, data: { status: "ERROR", lastCheckedAt: new Date(), lastError: message } });
    throw new SafeFetchError(message);
  }
}

/** Gebruikt de recent opgehaalde catalogus (max. 10 minuten oud), anders opnieuw ophalen. */
export async function getFeedCatalog(shopId: string, id: string, options: LoadOptions & { refresh?: boolean }) {
  const cached = catalogCache.get(`${shopId}:${id}`);
  if (!options.refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const row = await db.supplierConnection.findFirst({ where: { id, shopId } });
    if (!row) throw new Error("Feedbron niet gevonden");
    return { source: row, config: row.config as unknown as FeedConfig, parsed: cached.parsed, fetchedAt: new Date(cached.fetchedAt) };
  }
  const loaded = await loadFeedSource(shopId, id, options);
  return { ...loaded, fetchedAt: new Date() };
}

export async function checkFeedSource(shopId: string, id: string, userId: string | null, options: LoadOptions) {
  try {
    const { source, parsed } = await loadFeedSource(shopId, id, options);
    const message = `Feed "${source.name}" bereikbaar: ${parsed.products.length} producten, ${parsed.errors.length} regelfout(en).`;
    await logAudit({ shopId, actorUserId: userId, action: "feed.source.checked", entityType: "SupplierConnection", entityId: id, level: parsed.products.length ? "INFO" : "WARNING", message });
    return { ok: parsed.products.length > 0, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAudit({ shopId, actorUserId: userId, action: "feed.source.checked", entityType: "SupplierConnection", entityId: id, level: "ERROR", message: `Feedcontrole mislukt: ${message}` });
    return { ok: false, message };
  }
}

export function clearFeedCache() {
  catalogCache.clear();
}
