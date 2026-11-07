/**
 * Mogelijke duplicaten onder al geïmporteerde producten (ook tussen verschillende leveranciers):
 * zelfde EAN/GTIN, zelfde bron-URL of exact dezelfde (genormaliseerde) titel.
 * Alleen signaleren — Noblenest verwijdert of wijzigt niets automatisch.
 */
import db from "../db.server";
import { normalizeUrl } from "../lib/import/duplicates";

export type DuplicateReason = "GTIN" | "BRON_URL" | "TITEL";

export interface DuplicateGroup {
  reasons: DuplicateReason[];
  products: {
    supplierProductId: string;
    title: string;
    externalId: string;
    supplier: string;
    shopifyProductId: string;
    shopifyStatus: string;
  }[];
}

const MAX_PRODUCTS = 10000;

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeGtin(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 7 ? digits : null;
}

export async function findPossibleDuplicates(shopId: string): Promise<DuplicateGroup[]> {
  const rows = await db.supplierProduct.findMany({
    where: { shopId, mapping: { isNot: null } },
    select: {
      id: true,
      title: true,
      aiTitle: true,
      externalId: true,
      gtin: true,
      sourceUrl: true,
      supplier: { select: { name: true } },
      mapping: { select: { shopifyProductId: true, shopifyStatus: true } },
      variants: { select: { barcode: true } },
    },
    take: MAX_PRODUCTS,
  });

  // Union-find over producten die een sleutel delen.
  const parent = new Map<string, string>(rows.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const reasonsByRoot = new Map<string, Set<DuplicateReason>>();
  const pairReasons: { a: string; b: string; reason: DuplicateReason }[] = [];
  const index = new Map<string, string>();
  const link = (key: string, id: string, reason: DuplicateReason) => {
    const k = `${reason}:${key}`;
    const other = index.get(k);
    if (!other) return index.set(k, id);
    if (other !== id) pairReasons.push({ a: other, b: id, reason });
  };

  for (const r of rows) {
    const gtins = new Set([r.gtin, ...r.variants.map((v) => v.barcode)].map(normalizeGtin).filter((g): g is string => !!g));
    gtins.forEach((g) => link(g, r.id, "GTIN"));
    if (r.sourceUrl) {
      try {
        link(normalizeUrl(r.sourceUrl), r.id, "BRON_URL");
      } catch {
        /* ongeldige URL negeren */
      }
    }
    const t = normalizeTitle(r.aiTitle ?? r.title);
    if (t.length >= 6) link(t, r.id, "TITEL");
  }

  for (const { a, b } of pairReasons) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const { a, reason } of pairReasons) {
    const root = find(a);
    reasonsByRoot.set(root, (reasonsByRoot.get(root) ?? new Set()).add(reason));
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const root = find(r.id);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  }

  const order: DuplicateReason[] = ["GTIN", "BRON_URL", "TITEL"];
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({
      reasons: order.filter((o) => reasonsByRoot.get(root)?.has(o)),
      products: members.map((m) => ({
        supplierProductId: m.id,
        title: m.aiTitle ?? m.title,
        externalId: m.externalId,
        supplier: m.supplier.name,
        shopifyProductId: m.mapping!.shopifyProductId,
        shopifyStatus: m.mapping!.shopifyStatus,
      })),
    }))
    .sort((a, b) => b.products.length - a.products.length);
}
