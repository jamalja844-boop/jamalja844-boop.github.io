/**
 * Leveranciersregister.
 *
 * Elke leverancier krijgt een eerlijke integratiestatus. Een koppeling wordt pas "AVAILABLE"
 * als er een werkende, toegestane adapter is. Er wordt nooit gescrapet of beveiliging omzeild.
 */
import type { IntegrationStatus, Prisma, SupplierType } from "@prisma/client";
import db from "../db.server";

export interface SupplierDefinition {
  key: string;
  name: string;
  type: SupplierType;
  integrationStatus: IntegrationStatus;
  website: string | null;
  description: string;
  capabilities: {
    connectionCheck: boolean;
    products: boolean;
    variants: boolean;
    prices: boolean;
    stock: boolean;
    images: boolean;
    shipping: boolean;
    changeDetection: boolean;
  };
  /** Fase waarin de adapter gebouwd wordt (voor geplande koppelingen) */
  plannedPhase?: number;
}

const NONE = {
  connectionCheck: false,
  products: false,
  variants: false,
  prices: false,
  stock: false,
  images: false,
  shipping: false,
  changeDetection: false,
};

export const SUPPLIER_REGISTRY: SupplierDefinition[] = [
  {
    key: "csv",
    name: "CSV-bestand",
    type: "FILE",
    integrationStatus: "AVAILABLE",
    website: null,
    description:
      "Importeer producten uit een CSV-export van je leverancier of uit je eigen spreadsheet. Ondersteunt varianten, inkoopprijzen, voorraad, verzendkosten, levertijden en afbeeldingen (met beeldrechtencontrole).",
    capabilities: { ...NONE, products: true, variants: true, prices: true, stock: true, images: true, shipping: true },
  },
  {
    key: "xml-feed",
    name: "XML-productfeed",
    type: "FEED",
    integrationStatus: "AVAILABLE",
    website: null,
    description:
      "Productfeed in Google Merchant Center-formaat (RSS of Atom), het meest gebruikte feedformaat bij leveranciers. Varianten via item_group_id, inkoopprijs via cost_of_goods_sold of price. Als bestand uploaden of als feed-URL koppelen (veilig opgehaald, URL versleuteld opgeslagen).",
    capabilities: { ...NONE, connectionCheck: true, products: true, variants: true, prices: true, stock: true, images: true, shipping: true },
  },
  {
    key: "json-feed",
    name: "JSON-productfeed",
    type: "FEED",
    integrationStatus: "AVAILABLE",
    website: null,
    description:
      "JSON-export van je leverancier in het Noblenest-formaat (zie docs/FEED-FORMATEN.md). Als bestand uploaden of als feed-URL koppelen.",
    capabilities: { ...NONE, connectionCheck: true, products: true, variants: true, prices: true, stock: true, images: true, shipping: true },
  },
  {
    key: "manual",
    name: "Handmatige invoer",
    type: "MANUAL",
    integrationStatus: "AVAILABLE",
    website: null,
    description: "Productgegevens zelf invoeren, met dezelfde prijs-, kwaliteits- en duplicaatcontroles als bij andere imports.",
    capabilities: { ...NONE, products: true, variants: true, prices: true, stock: true, images: true, shipping: true },
  },
  {
    key: "aliexpress",
    name: "AliExpress",
    type: "API",
    integrationStatus: "REQUIRES_APPROVAL",
    website: "https://openservice.aliexpress.com",
    description:
      "Koppeling via het officiële AliExpress Open Platform (Dropshipping-API). Hiervoor heb je een goedgekeurd ontwikkelaarsaccount met App Key en App Secret nodig. Zodra je App Key en App Secret hebt, kan de adapter worden gebouwd; tot die tijd importeer je AliExpress-producten via CSV of een feed.",
    capabilities: NONE,
    plannedPhase: 3,
  },
  {
    key: "alibaba",
    name: "Alibaba.com",
    type: "API",
    integrationStatus: "REQUIRES_APPROVAL",
    website: "https://openapi.alibaba.com",
    description:
      "Alibaba.com geeft API-toegang alleen aan goedgekeurde partners. Zonder die toegang gebruik je een productfeed of CSV-export van de leverancier.",
    capabilities: NONE,
    plannedPhase: 3,
  },
  {
    key: "temu",
    name: "Temu",
    type: "API",
    integrationStatus: "NOT_AVAILABLE",
    website: null,
    description:
      "Er is ons geen openbare API van Temu bekend voor productimport door externe webshops. Productpagina's overnemen (scraping) is niet toegestaan en wordt niet ondersteund. Mocht Temu een officiële koppeling aanbieden, dan kan een adapter worden toegevoegd.",
    capabilities: NONE,
  },
  {
    key: "shopify-collective",
    name: "Shopify Collective",
    type: "SHOPIFY",
    integrationStatus: "NOT_AVAILABLE",
    website: "https://apps.shopify.com/collective",
    description:
      "Shopify Collective werkt via de Shopify Collective-app in je Shopify-admin (alleen voor winkels die daarvoor in aanmerking komen). Er is ons geen API bekend waarmee externe apps Collective-producten kunnen importeren; importeer deze producten daarom rechtstreeks via de Collective-app.",
    capabilities: NONE,
  },
];

let registryEnsured = false;

/** Zorgt dat het leveranciersregister in de database staat (idempotent, eenmaal per proces). */
export async function ensureSupplierRegistry(client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  if (registryEnsured && client === db) return;
  for (const s of SUPPLIER_REGISTRY) {
    const data = {
      name: s.name,
      type: s.type,
      integrationStatus: s.integrationStatus,
      website: s.website,
      description: s.description,
      capabilities: s.capabilities,
    };
    await client.supplier.upsert({ where: { key: s.key }, create: { key: s.key, ...data }, update: data });
  }
  if (client === db) registryEnsured = true;
}

export function resetSupplierRegistryCache() {
  registryEnsured = false;
}

export async function getSupplierByKey(key: string) {
  await ensureSupplierRegistry();
  const supplier = await db.supplier.findUnique({ where: { key } });
  if (!supplier) throw new Error(`Onbekende leverancier: ${key}`);
  return supplier;
}

export function importableSuppliers() {
  return SUPPLIER_REGISTRY.filter((s) => s.integrationStatus === "AVAILABLE" && (s.type === "FILE" || s.type === "FEED"));
}
