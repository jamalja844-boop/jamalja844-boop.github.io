import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import db from "../db.server";
import { requireShop } from "../services/shop.server";
import { getFeedCatalog, listFeedSources } from "../services/feed-sources.server";
import { createPreview } from "../services/import.server";
import { checkProduct } from "../lib/import/compliance";
import { sourceKeyFor } from "../lib/import/types";
import { formatDateTime, formatMoney, STOCK_STATUS } from "../lib/format";
import { useElementEvent } from "../hooks/use-element-event";

const PAGE_SIZE = 50;
const STOCK_FILTERS = ["alle", "op_voorraad", "onbekend", "niet_op_voorraad"] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const feeds = await listFeedSources(shop.id);
  const sourceId = url.searchParams.get("bron") ?? feeds[0]?.id ?? null;
  const q = url.searchParams.get("q")?.trim().toLowerCase().slice(0, 100) ?? "";
  const maxCostRaw = url.searchParams.get("maxPrijs")?.replace(",", ".").trim() ?? "";
  const maxCost = maxCostRaw && Number.isFinite(Number(maxCostRaw)) ? Number(maxCostRaw) : null;
  const stockParam = url.searchParams.get("voorraad");
  const stock = STOCK_FILTERS.includes(stockParam as (typeof STOCK_FILTERS)[number]) ? (stockParam as (typeof STOCK_FILTERS)[number]) : "alle";
  const page = Math.max(1, Number(url.searchParams.get("pagina") ?? 1) || 1);

  const base = { feeds: feeds.map((f) => ({ id: f.id, name: f.name })), sourceId, q, maxCost: maxCostRaw, stock, page };
  if (!sourceId) return { ...base, error: null, fetchedAt: null, total: 0, pages: 1, products: [] };

  try {
    const { parsed, fetchedAt } = await getFeedCatalog(shop.id, sourceId, { defaultCurrency: shop.currencyCode ?? "EUR" });
    const filtered = parsed.products.filter((p) => {
      if (q && ![p.title, p.externalId, p.productType ?? "", p.brand ?? "", p.vendor ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
      const costs = p.variants.map((v) => v.costPrice).filter((c): c is string => c !== null).map(Number);
      const minCost = costs.length ? Math.min(...costs) : null;
      if (maxCost !== null && (minCost === null || minCost > maxCost)) return false;
      if (stock === "op_voorraad" && p.stockStatus !== "IN_STOCK") return false;
      if (stock === "onbekend" && p.stockStatus !== "UNKNOWN") return false;
      if (stock === "niet_op_voorraad" && p.stockStatus !== "OUT_OF_STOCK") return false;
      return true;
    });
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const keys = pageItems.map((p) => sourceKeyFor(p.supplierKey, p.externalId));
    const imported = new Set(
      (await db.shopifyProductMapping.findMany({ where: { shopId: shop.id, sourceKey: { in: keys } }, select: { sourceKey: true } })).map((m) => m.sourceKey),
    );
    return {
      ...base,
      error: null,
      fetchedAt: fetchedAt.toISOString(),
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
      products: pageItems.map((p) => {
        const costs = p.variants.map((v) => v.costPrice).filter((c): c is string => c !== null).map(Number);
        const flags = checkProduct(p);
        return {
          externalId: p.externalId,
          title: p.title,
          brand: p.brand ?? p.vendor,
          productType: p.productType,
          image: p.images[0]?.url ?? null,
          imageCount: p.images.length,
          variantCount: p.variants.length,
          options: p.options.map((o) => o.name).join(", "),
          currency: p.currencyCode,
          minCost: costs.length ? Math.min(...costs) : null,
          maxCost: costs.length ? Math.max(...costs) : null,
          shippingCost: p.shippingCost,
          delivery: p.deliveryDaysMin !== null || p.deliveryDaysMax !== null ? `${p.deliveryDaysMin ?? "?"}–${p.deliveryDaysMax ?? "?"} dagen` : null,
          stockStatus: p.stockStatus,
          blocking: flags.some((f) => f.severity === "error"),
          warnings: flags.filter((f) => f.severity === "warning").length,
          imported: imported.has(sourceKeyFor(p.supplierKey, p.externalId)),
        };
      }),
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : "De feed kon niet worden geladen.", fetchedAt: null, total: 0, pages: 1, products: [] };
  }
};

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("preview"), sourceId: z.string().min(1), selectedIds: z.string() }),
  z.object({ intent: z.literal("refresh"), sourceId: z.string().min(1) }),
]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user, redirect } = await requireShop(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { ok: false, message: "Ongeldig verzoek." };
  const defaultCurrency = shop.currencyCode ?? "EUR";
  try {
    if (parsed.data.intent === "refresh") {
      const { parsed: catalog } = await getFeedCatalog(shop.id, parsed.data.sourceId, { defaultCurrency, refresh: true });
      return { ok: true, message: `Catalogus vernieuwd: ${catalog.products.length} producten.` };
    }
    const ids = z.array(z.string().min(1)).min(1, "Selecteer ten minste één product.").max(5000).parse(JSON.parse(parsed.data.selectedIds));
    const { source, config, parsed: catalog } = await getFeedCatalog(shop.id, parsed.data.sourceId, { defaultCurrency });
    const { job } = await createPreview({
      shop,
      userId: user?.id ?? null,
      sourceName: `Zoeken: ${source.name} (${ids.length})`,
      format: config.format,
      parsed: catalog,
      onlyExternalIds: ids,
    });
    const target = `/app/import/${job.id}`;
    return redirect ? redirect(target) : Response.redirect(target, 303);
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Ongeldige selectie." : error instanceof Error ? error.message : "Er ging iets mis.";
    return { ok: false, message };
  }
};

type Product = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];

function RowCheckbox({ product, checked, onToggle }: { product: Product; checked: boolean; onToggle: (id: string, v: boolean) => void }) {
  const ref = useElementEvent<HTMLElementTagNameMap["s-checkbox"]>("change", (e) => onToggle(product.externalId, e.currentTarget.checked));
  return <s-checkbox ref={ref} accessibilityLabel={`Selecteer ${product.title}`} checked={checked} disabled={product.imported} />;
}

export default function SearchPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sourceRef = useElementEvent<HTMLElementTagNameMap["s-select"]>("change", (e) => {
    setSelected(new Set());
    navigate(`/app/search?bron=${encodeURIComponent(e.currentTarget.value)}`);
  });

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
  }, [fetcher.data, shopify]);

  const toggle = (id: string, value: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  const comparing = useMemo(() => data.products.filter((p) => selected.has(p.externalId)), [data.products, selected]);
  const pageLink = (page: number) =>
    `/app/search?${new URLSearchParams({ bron: data.sourceId ?? "", q: data.q, maxPrijs: data.maxCost, voorraad: data.stock, pagina: String(page) })}`;

  if (data.feeds.length === 0) {
    return (
      <s-page heading="Producten zoeken" inlineSize="large">
        <s-section>
          <s-stack direction="block" gap="base" alignItems="center">
            <s-heading>Nog geen feedbron gekoppeld</s-heading>
            <s-paragraph color="subdued">
              Koppel de productfeed van een leverancier (XML of JSON) om hier de catalogus te doorzoeken, te filteren en
              producten te vergelijken.
            </s-paragraph>
            <s-button variant="primary" href="/app/suppliers?nieuw=feed">
              Feedbron koppelen
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Producten zoeken" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={selected.size === 0}
        loading={busy && fetcher.formData?.get("intent") === "preview"}
        onClick={() => fetcher.submit({ intent: "preview", sourceId: data.sourceId!, selectedIds: JSON.stringify([...selected]) }, { method: "post" })}
      >
        {selected.size ? `${selected.size} naar importvoorbeeld` : "Selecteer producten"}
      </s-button>
      <s-button
        slot="secondary-actions"
        loading={busy && fetcher.formData?.get("intent") === "refresh"}
        onClick={() => fetcher.submit({ intent: "refresh", sourceId: data.sourceId! }, { method: "post" })}
      >
        Catalogus vernieuwen
      </s-button>

      <s-section padding="base">
        <Form method="get">
          <input type="hidden" name="bron" value={data.sourceId ?? ""} />
          <s-grid gridTemplateColumns="1.2fr 2fr 1fr 1fr auto" gap="base" alignItems="end">
            <s-select ref={sourceRef} label="Leverancier (feed)" value={data.sourceId ?? ""}>
              {data.feeds.map((f) => (
                <s-option key={f.id} value={f.id}>
                  {f.name}
                </s-option>
              ))}
            </s-select>
            <s-search-field label="Zoeken" name="q" defaultValue={data.q} placeholder="Titel, merk, categorie of ID" />
            <s-text-field label="Max. inkoopprijs" name="maxPrijs" defaultValue={data.maxCost} placeholder="bijv. 25" />
            <s-select label="Voorraad" name="voorraad" value={data.stock}>
              <s-option value="alle">Alle</s-option>
              <s-option value="op_voorraad">Op voorraad</s-option>
              <s-option value="onbekend">Onbekend</s-option>
              <s-option value="niet_op_voorraad">Niet op voorraad</s-option>
            </s-select>
            <s-button type="submit">Filteren</s-button>
          </s-grid>
        </Form>
      </s-section>

      {data.error ? (
        <s-banner tone="critical" heading="Feed kon niet worden geladen">
          <s-paragraph>{data.error}</s-paragraph>
        </s-banner>
      ) : null}

      {comparing.length >= 2 ? (
        <s-section heading={`Vergelijken (${comparing.length})`} padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header format="currency">Inkoop</s-table-header>
              <s-table-header format="currency">Verzending</s-table-header>
              <s-table-header>Levertijd</s-table-header>
              <s-table-header>Voorraad</s-table-header>
              <s-table-header format="numeric">Varianten</s-table-header>
              <s-table-header format="numeric">Foto’s</s-table-header>
              <s-table-header format="numeric">Aandachtspunten</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {comparing.map((p) => (
                <s-table-row key={p.externalId}>
                  <s-table-cell>{p.title}</s-table-cell>
                  <s-table-cell>{p.minCost !== null ? formatMoney(p.minCost, p.currency) : "—"}</s-table-cell>
                  <s-table-cell>{p.shippingCost ? formatMoney(p.shippingCost, p.currency) : "—"}</s-table-cell>
                  <s-table-cell>{p.delivery ?? "—"}</s-table-cell>
                  <s-table-cell>{STOCK_STATUS[p.stockStatus]?.label}</s-table-cell>
                  <s-table-cell>{p.variantCount}</s-table-cell>
                  <s-table-cell>{p.imageCount}</s-table-cell>
                  <s-table-cell>{p.warnings}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      ) : null}

      <s-section heading={data.fetchedAt ? `${data.total} producten · opgehaald ${formatDateTime(data.fetchedAt)}` : "Producten"} padding="none">
        {data.products.length === 0 ? (
          <s-box padding="base">
            <s-paragraph color="subdued">{data.error ? "Geen gegevens." : "Geen producten gevonden met deze filters."}</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Selecteren</s-table-header>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Categorie</s-table-header>
              <s-table-header format="currency">Inkoop</s-table-header>
              <s-table-header>Varianten</s-table-header>
              <s-table-header>Levertijd</s-table-header>
              <s-table-header>Voorraad</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.products.map((p) => (
                <s-table-row key={p.externalId}>
                  <s-table-cell>
                    <RowCheckbox product={p} checked={selected.has(p.externalId)} onToggle={toggle} />
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-thumbnail src={p.image ?? undefined} alt={p.title} size="small" />
                      <s-stack direction="block" gap="none">
                        <s-text type="strong">{p.title}</s-text>
                        <s-text color="subdued">
                          {p.externalId}
                          {p.brand ? ` · ${p.brand}` : ""}
                        </s-text>
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{p.productType ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {p.minCost === null ? "—" : p.minCost === p.maxCost ? formatMoney(p.minCost, p.currency) : `${formatMoney(p.minCost, p.currency)} – ${formatMoney(p.maxCost, p.currency)}`}
                  </s-table-cell>
                  <s-table-cell>
                    {p.variantCount}
                    {p.options ? <s-text color="subdued"> · {p.options}</s-text> : null}
                  </s-table-cell>
                  <s-table-cell>{p.delivery ?? "—"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STOCK_STATUS[p.stockStatus]?.tone}>{STOCK_STATUS[p.stockStatus]?.label}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {p.imported ? (
                      <s-badge tone="success">Al geïmporteerd</s-badge>
                    ) : p.blocking ? (
                      <s-badge tone="critical">Gegevens ontbreken</s-badge>
                    ) : p.warnings ? (
                      <s-badge tone="warning">{`${p.warnings} aandachtspunt${p.warnings === 1 ? "" : "en"}`}</s-badge>
                    ) : (
                      <s-badge tone="info">Klaar voor voorbeeld</s-badge>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {data.pages > 1 ? (
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="center">
          <s-button disabled={data.page <= 1} href={pageLink(data.page - 1)}>
            Vorige
          </s-button>
          <s-text color="subdued">
            Pagina {data.page} van {data.pages}
          </s-text>
          <s-button disabled={data.page >= data.pages} href={pageLink(data.page + 1)}>
            Volgende
          </s-button>
        </s-stack>
      ) : null}

      <s-section slot="aside" heading="Zo werkt het">
        <s-unordered-list>
          <s-list-item>Kies een gekoppelde feed en filter de catalogus.</s-list-item>
          <s-list-item>Selecteer 2 of meer producten om ze te vergelijken.</s-list-item>
          <s-list-item>Zet de selectie door naar het importvoorbeeld: daar zie je prijzen en controles en geef je akkoord.</s-list-item>
          <s-list-item>De catalogus wordt 10 minuten bewaard; vernieuw voor de nieuwste gegevens.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
