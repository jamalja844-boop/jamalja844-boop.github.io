import db from "../../app/db.server";
import type { AdminGraphqlClient } from "../../app/services/graphql.server";

export async function resetDatabase() {
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.aIJob.deleteMany(),
    db.syncJob.deleteMany(),
    db.importJobItem.deleteMany(),
    db.importJob.deleteMany(),
    db.shopifyProductMapping.deleteMany(),
    db.productImage.deleteMany(),
    db.productVariant.deleteMany(),
    db.supplierProduct.deleteMany(),
    db.supplierConnection.deleteMany(),
    db.pricingRule.deleteMany(),
    db.appSetting.deleteMany(),
    db.user.deleteMany(),
    db.shop.deleteMany(),
  ]);
}

export async function createShop(domain = "noblenest-test.myshopify.com") {
  return db.shop.create({ data: { shopDomain: domain, name: "Noblenest Test", currencyCode: "EUR" } });
}

export async function createDefaultRule(shopId: string) {
  return db.pricingRule.create({
    data: {
      shopId,
      name: "Standaard 120% opslag",
      strategy: "PERCENTAGE_MARKUP",
      value: "120",
      rounding: "END_95",
      vatPercent: "21",
      pricesIncludeVat: true,
    },
  });
}

/** Geeft ECB-koersen terug zonder netwerk. */
export const fakeEcbFetch: typeof fetch = async () =>
  new Response(
    `<Cube><Cube time='2026-11-06'><Cube currency='USD' rate='1.0800'/><Cube currency='CNY' rate='7.8000'/></Cube></Cube>`,
    { status: 200 },
  );

type Handler = (variables: Record<string, unknown>) => unknown | Promise<unknown>;

/**
 * Nep-Shopify: houdt aangemaakte producten bij (inclusief bron-ID-metafield) zodat
 * productByIdentifier realistisch werkt. Gedrag per operatie is te overschrijven.
 */
export function createFakeShopify() {
  const products = new Map<string, { id: string; handle: string; status: string; sourceId: string; input: any }>();
  const calls: { operation: string; variables: Record<string, unknown> }[] = [];
  let counter = 1000;
  const overrides: Partial<Record<"create" | "lookup", Handler>> = {};

  const create: Handler = (variables) => {
    const input = variables.input as any;
    const sourceId = input.metafields.find((m: any) => m.key === "source_id").value;
    if ([...products.values()].some((p) => p.sourceId === sourceId)) {
      return { data: { productSet: { product: null, userErrors: [{ field: ["metafields", "0", "value"], message: "Value must be unique", code: "TAKEN" }] } } };
    }
    const id = `gid://shopify/Product/${++counter}`;
    const product = { id, handle: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: input.status, sourceId, input };
    products.set(id, product);
    const variants = input.variants.map((v: any, i: number) => ({
      id: `gid://shopify/ProductVariant/${counter * 10 + i}`,
      sku: v.sku ?? null,
      selectedOptions: v.optionValues.map((o: any) => ({ name: o.optionName, value: o.name })),
    }));
    return { data: { productSet: { product: { id, handle: product.handle, status: product.status, variants: { nodes: variants } }, userErrors: [] } } };
  };

  const lookup: Handler = (variables) => {
    const value = (variables.identifier as any).customId.value;
    const found = [...products.values()].find((p) => p.sourceId === value);
    return { data: { productByIdentifier: found ? { id: found.id, handle: found.handle, status: found.status } : null } };
  };

  const client: AdminGraphqlClient = async (query, options) => {
    const variables = options?.variables ?? {};
    const operation = query.includes("productSet(") ? "create" : query.includes("productByIdentifier") ? "lookup" : "other";
    calls.push({ operation, variables });
    const handler = operation === "create" ? overrides.create ?? create : operation === "lookup" ? overrides.lookup ?? lookup : () => ({ data: {} });
    const body = await handler(variables);
    return { json: async () => body };
  };

  return { client, products, calls, overrides, defaults: { create, lookup } };
}
