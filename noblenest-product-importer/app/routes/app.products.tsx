import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { requireShop } from "../services/shop.server";
import { formatDateTime, formatMoney, STOCK_STATUS } from "../lib/format";

const PAGE_SIZE = 50;
const SHOPIFY_STATUS: Record<string, { label: string; tone: "info" | "success" | "neutral" }> = {
  DRAFT: { label: "Concept", tone: "info" },
  ACTIVE: { label: "Actief", tone: "success" },
  ARCHIVED: { label: "Gearchiveerd", tone: "neutral" },
  UNLISTED: { label: "Niet vermeld", tone: "neutral" },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number(url.searchParams.get("pagina") ?? 1) || 1);

  const where: Prisma.ShopifyProductMappingWhereInput = {
    shopId: shop.id,
    ...(q
      ? {
          OR: [
            { supplierProduct: { title: { contains: q, mode: "insensitive" } } },
            { supplierProduct: { externalId: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, mappings] = await Promise.all([
    db.shopifyProductMapping.count({ where }),
    db.shopifyProductMapping.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        supplierProduct: {
          include: {
            supplier: { select: { name: true } },
            images: { orderBy: { position: "asc" }, take: 1 },
            _count: { select: { variants: true } },
          },
        },
      },
    }),
  ]);

  const storeHandle = shop.shopDomain.replace(".myshopify.com", "");
  return {
    q,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    currency: shop.currencyCode ?? "EUR",
    products: mappings.map((m) => ({
      id: m.id,
      title: m.supplierProduct.aiTitle ?? m.supplierProduct.title,
      externalId: m.supplierProduct.externalId,
      supplier: m.supplierProduct.supplier.name,
      vendor: m.supplierProduct.vendor,
      image: m.supplierProduct.images[0]?.sourceUrl ?? null,
      variants: m.supplierProduct._count.variants,
      status: m.shopifyStatus,
      stockStatus: m.supplierProduct.stockStatus,
      costPrice: m.supplierProduct.costPrice?.toString() ?? null,
      costCurrency: m.supplierProduct.currencyCode,
      sellingPrice: m.sellingPrice?.toString() ?? null,
      lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
      adminUrl: `https://admin.shopify.com/store/${storeHandle}/products/${m.shopifyProductId.split("/").pop()}`,
    })),
  };
};

export default function ProductsPage() {
  const { products, q, page, pages, total, currency } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Mijn producten" inlineSize="large">
      <s-button slot="primary-action" href="/app/import">
        Producten importeren
      </s-button>
      <s-section padding="base">
        <Form method="get">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
            <s-search-field label="Zoeken" labelAccessibilityVisibility="exclusive" name="q" defaultValue={q} placeholder="Zoek op titel of leveranciers-ID" />
            <s-button type="submit">Zoeken</s-button>
          </s-grid>
        </Form>
      </s-section>

      <s-section padding="none">
        {products.length === 0 ? (
          <s-box padding="large">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>{q ? "Geen producten gevonden" : "Nog geen geïmporteerde producten"}</s-heading>
              <s-paragraph color="subdued">
                {q ? "Pas je zoekopdracht aan." : "Geïmporteerde producten verschijnen hier met leverancier, inkoop- en verkoopprijs."}
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Leverancier</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Varianten</s-table-header>
              <s-table-header format="currency">Inkoop vanaf</s-table-header>
              <s-table-header format="currency">Verkoop vanaf</s-table-header>
              <s-table-header>Voorraad</s-table-header>
              <s-table-header>Gekoppeld</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((p) => (
                <s-table-row key={p.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-thumbnail src={p.image ?? undefined} alt={p.title} size="small" />
                      <s-stack direction="block" gap="none">
                        <s-link href={p.adminUrl} target="_blank">
                          {p.title}
                        </s-link>
                        <s-text color="subdued">{p.externalId}</s-text>
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {p.supplier}
                    {p.vendor ? <s-text color="subdued"> · {p.vendor}</s-text> : null}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={SHOPIFY_STATUS[p.status]?.tone ?? "neutral"}>{SHOPIFY_STATUS[p.status]?.label ?? p.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{p.variants}</s-table-cell>
                  <s-table-cell>{formatMoney(p.costPrice, p.costCurrency)}</s-table-cell>
                  <s-table-cell>{formatMoney(p.sellingPrice, currency)}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STOCK_STATUS[p.stockStatus]?.tone}>{STOCK_STATUS[p.stockStatus]?.label}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{formatDateTime(p.lastSyncedAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {pages > 1 ? (
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="center">
          <s-button disabled={page <= 1} href={`/app/products?${new URLSearchParams({ q, pagina: String(page - 1) })}`}>
            Vorige
          </s-button>
          <s-text color="subdued">
            Pagina {page} van {pages} · {total} producten
          </s-text>
          <s-button disabled={page >= pages} href={`/app/products?${new URLSearchParams({ q, pagina: String(page + 1) })}`}>
            Volgende
          </s-button>
        </s-stack>
      ) : null}

      <s-section slot="aside" heading="Over deze lijst">
        <s-unordered-list>
          <s-list-item>Status is de stand bij import; synchronisatie met Shopify volgt in fase 6.</s-list-item>
          <s-list-item>Publiceren doe je zelf in Shopify, na controle.</s-list-item>
          <s-list-item>Duplicaten worden bij elke import automatisch overgeslagen.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
