import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { EditError, getEditableItem, saveItemEdits, type StoredPricing } from "../services/item-edits.server";
import { getCustomCollections } from "../services/collections.server";
import type { ItemFlags } from "../services/import.server";
import { findDuplicateImages, RECOMMENDED_MIN_IMAGE_SIZE, type ItemOverrides } from "../lib/import/overrides";
import type { NormalizedProduct } from "../lib/import/types";
import { formatMoney, formatPercent, SEVERITY_TONE } from "../lib/format";
import { useElementEvent } from "../hooks/use-element-event";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop, client } = await requireShop(request);
  const item = await getEditableItem(shop.id, params.jobId!, params.itemId!);
  if (!item) throw new Response("Product niet gevonden", { status: 404 });
  const product = item.payload as unknown as NormalizedProduct;
  const overrides = (item.overrides ?? {}) as ItemOverrides;
  const pricing = item.pricing as unknown as StoredPricing | null;
  const editable = item.importJob.status === "PREVIEW" && item.status === "PENDING";
  const { collections, error: collectionsError } = editable ? await getCustomCollections(shop.id, client) : { collections: [], error: null };

  return {
    jobId: item.importJobId,
    itemId: item.id,
    editable,
    currency: shop.currencyCode ?? "EUR",
    product,
    overrides,
    flags: (item.flags as unknown as ItemFlags).flags,
    ruleName: pricing?.ruleName ?? null,
    manualVariants: pricing?.manualVariants ?? [],
    variants: product.variants.map((v) => ({
      externalId: v.externalId,
      label: v.options.length ? v.options.map((o) => o.value).join(" / ") : "Standaard",
      sku: v.sku,
      costPrice: v.costPrice,
      imageUrl: v.imageUrl,
      calc: pricing?.variants?.[v.externalId] ?? null,
      auto: pricing?.originalVariants?.[v.externalId] ?? pricing?.variants?.[v.externalId] ?? null,
    })),
    duplicates: findDuplicateImages(product.images.map((i) => i.url)),
    collections,
    collectionsError,
    jobImageConsent: item.importJob.imageRightsConfirmed,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop, user } = await requireShop(request);
  const item = await getEditableItem(shop.id, params.jobId!, params.itemId!);
  if (!item) return { ok: false, message: "Product niet gevonden.", warnings: [] as string[] };
  const product = item.payload as unknown as NormalizedProduct;
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "");
  const changed = (value: string, original: string | null) => (value.trim() && value.trim() !== (original ?? "").trim() ? value.trim() : undefined);

  const tags = text("tags").split(",").map((t) => t.trim()).filter(Boolean);
  let images: string[] | undefined;
  try {
    const list = JSON.parse(text("imagesJson") || "null") as string[] | null;
    const original = product.images.map((i) => i.url);
    images = list && JSON.stringify(list) !== JSON.stringify(original) ? list : undefined;
  } catch {
    return { ok: false, message: "Ongeldige afbeeldingsselectie.", warnings: [] as string[] };
  }

  const variantImages: Record<string, string | null> = {};
  const prices: Record<string, string | null> = {};
  product.variants.forEach((v, i) => {
    const img = text(`vimg_${i}`) || null;
    if (img !== (v.imageUrl ?? null)) variantImages[v.externalId] = img;
    prices[v.externalId] = text(`price_${i}`) || null;
  });

  const collections = form.getAll("collections").map(String).filter(Boolean);
  const overrides = {
    title: changed(text("title"), product.title),
    descriptionHtml: changed(text("descriptionHtml"), product.descriptionHtml),
    productType: changed(text("productType"), product.productType),
    vendor: changed(text("vendor"), product.vendor ?? product.brand),
    tags: tags.join(",") !== product.tags.join(",") ? tags : undefined,
    seoTitle: text("seoTitle").trim() || undefined,
    seoDescription: text("seoDescription").trim() || undefined,
    images,
    variantImages: Object.keys(variantImages).length ? variantImages : undefined,
    collections: collections.length ? collections : undefined,
  };

  try {
    const { warnings } = await saveItemEdits(shop.id, params.jobId!, params.itemId!, { overrides, prices }, user?.id ?? null);
    return { ok: true, message: "Wijzigingen opgeslagen.", warnings };
  } catch (error) {
    return { ok: false, message: error instanceof EditError || error instanceof Error ? error.message : "Opslaan mislukt.", warnings: [] as string[] };
  }
};

type Data = ReturnType<typeof useLoaderData<typeof loader>>;
type ImageState = { url: string; included: boolean };

function useImageSizes(urls: string[]) {
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number } | "fout">>({});
  useEffect(() => {
    let cancelled = false;
    for (const url of urls) {
      const img = new Image();
      img.onload = () => !cancelled && setSizes((s) => ({ ...s, [url]: { w: img.naturalWidth, h: img.naturalHeight } }));
      img.onerror = () => !cancelled && setSizes((s) => ({ ...s, [url]: "fout" }));
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [urls]);
  return sizes;
}

function IncludeCheckbox({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const ref = useElementEvent<HTMLElementTagNameMap["s-checkbox"]>("change", (e) => onChange(e.currentTarget.checked));
  return <s-checkbox ref={ref} label="Gebruiken" checked={checked} disabled={disabled} />;
}

function ImagesEditor({ data, state, setState }: { data: Data; state: ImageState[]; setState: (s: ImageState[]) => void }) {
  const urls = useMemo(() => data.product.images.map((i) => i.url), [data.product.images]);
  const sizes = useImageSizes(urls);
  const rights = new Map(data.product.images.map((i) => [i.url, i.rights]));
  const duplicateOf = new Map<string, number>();
  data.duplicates.forEach((group, g) => group.forEach((u) => duplicateOf.set(u, g + 1)));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= state.length) return;
    const next = [...state];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setState(next);
  };

  if (state.length === 0) return <s-paragraph color="subdued">Dit product heeft geen afbeeldingen. Voeg foto’s toe in Shopify na de import.</s-paragraph>;

  let position = 0;
  return (
    <s-stack direction="block" gap="small-200">
      {state.map((img, index) => {
        const size = sizes[img.url];
        const small = size && size !== "fout" && Math.min(size.w, size.h) < RECOMMENDED_MIN_IMAGE_SIZE;
        const unverified = rights.get(img.url) === "UNVERIFIED" && !data.jobImageConsent;
        if (img.included) position++;
        return (
          <s-box key={img.url} padding="small-200" border="base" borderRadius="base">
            <s-grid gridTemplateColumns="auto 1fr auto" gap="base" alignItems="center">
              <s-thumbnail src={img.url} alt={`Afbeelding ${index + 1}`} size="small" />
              <s-stack direction="block" gap="small-100">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  {img.included ? <s-badge tone={position === 1 ? "success" : "info"}>{position === 1 ? "Hoofdfoto" : `Foto ${position}`}</s-badge> : <s-badge tone="neutral">Niet gebruiken</s-badge>}
                  {size === "fout" ? <s-badge tone="critical">Niet te laden</s-badge> : size ? <s-badge tone={small ? "warning" : "neutral"}>{`${size.w} × ${size.h}${small ? " — klein" : ""}`}</s-badge> : null}
                  {unverified ? <s-badge tone="warning">Beeldrechten niet bevestigd</s-badge> : null}
                  {duplicateOf.has(img.url) ? <s-badge tone="caution">{`Mogelijk duplicaat (groep ${duplicateOf.get(img.url)})`}</s-badge> : null}
                </s-stack>
                <s-text color="subdued">{img.url.length > 80 ? `${img.url.slice(0, 80)}…` : img.url}</s-text>
              </s-stack>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <IncludeCheckbox
                  checked={img.included}
                  disabled={!data.editable}
                  onChange={(v) => setState(state.map((s, i) => (i === index ? { ...s, included: v } : s)))}
                />
                <s-button variant="tertiary" icon="arrow-up" accessibilityLabel="Omhoog" disabled={!data.editable || index === 0} onClick={() => move(index, index - 1)} />
                <s-button variant="tertiary" icon="arrow-down" accessibilityLabel="Omlaag" disabled={!data.editable || index === state.length - 1} onClick={() => move(index, index + 1)} />
                <s-button variant="tertiary" disabled={!data.editable || (index === 0 && img.included)} onClick={() => setState([{ ...img, included: true }, ...state.filter((_, i) => i !== index)])}>
                  Hoofdfoto
                </s-button>
              </s-stack>
            </s-grid>
          </s-box>
        );
      })}
    </s-stack>
  );
}

export default function EditItemPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const { product, overrides } = data;

  const [images, setImages] = useState<ImageState[]>(() => {
    const all = product.images.map((i) => i.url);
    if (!overrides.images) return all.map((url) => ({ url, included: true }));
    const included = overrides.images.filter((u) => all.includes(u));
    return [...included.map((url) => ({ url, included: true })), ...all.filter((u) => !included.includes(u)).map((url) => ({ url, included: false }))];
  });
  const includedUrls = images.filter((i) => i.included).map((i) => i.url);
  const imagesJson = JSON.stringify(includedUrls);

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
  }, [fetcher.data, shopify]);

  const variantImageDefault = (v: Data["variants"][number]) =>
    overrides.variantImages && v.externalId in overrides.variantImages ? overrides.variantImages[v.externalId] ?? "" : v.imageUrl ?? "";

  return (
    <s-page heading={overrides.title ?? product.title} inlineSize="large">
      <s-link slot="breadcrumb-actions" href={`/app/import/${data.jobId}`}>
        Importvoorbeeld
      </s-link>
      {!data.editable ? (
        <s-banner tone="info" heading="Alleen bekijken">
          <s-paragraph>Dit product kan niet meer worden bewerkt: de import is gestart of het product wordt niet geïmporteerd.</s-paragraph>
        </s-banner>
      ) : null}
      {fetcher.data && !fetcher.data.ok ? <s-banner tone="critical">{fetcher.data.message}</s-banner> : null}
      {fetcher.data?.ok && fetcher.data.warnings.length ? (
        <s-banner tone="warning" heading="Let op">
          <s-unordered-list>
            {fetcher.data.warnings.map((w) => (
              <s-list-item key={w}>{w}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      ) : null}

      <fetcher.Form method="post">
        <input type="hidden" name="imagesJson" value={imagesJson} />
        <s-stack direction="block" gap="base">
          <s-section heading="Teksten">
            <s-stack direction="block" gap="base">
              <s-text-field label="Titel" name="title" defaultValue={overrides.title ?? product.title} maxLength={255} disabled={!data.editable} />
              <s-text-area
                label="Beschrijving"
                name="descriptionHtml"
                rows={6}
                defaultValue={overrides.descriptionHtml ?? product.descriptionHtml ?? ""}
                details="Eenvoudige opmaak toegestaan (<p>, <strong>, <ul>, <li>, <h2>…). Overige HTML wordt verwijderd."
                disabled={!data.editable}
              />
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field label="Producttype" name="productType" defaultValue={overrides.productType ?? product.productType ?? ""} disabled={!data.editable} />
                <s-text-field label="Leverancier / merk" name="vendor" defaultValue={overrides.vendor ?? product.vendor ?? product.brand ?? ""} disabled={!data.editable} />
              </s-grid>
              <s-text-field label="Tags" name="tags" defaultValue={(overrides.tags ?? product.tags).join(", ")} details="Komma-gescheiden" disabled={!data.editable} />
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field label="SEO-titel" name="seoTitle" defaultValue={overrides.seoTitle ?? ""} maxLength={70} details="Max. 70 tekens; leeg = producttitel" disabled={!data.editable} />
                <s-text-field label="Metabeschrijving" name="seoDescription" defaultValue={overrides.seoDescription ?? ""} maxLength={320} details="Max. 320 tekens" disabled={!data.editable} />
              </s-grid>
            </s-stack>
          </s-section>

          <s-section heading="Prijzen" padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Variant</s-table-header>
                <s-table-header format="currency">Kostprijs</s-table-header>
                <s-table-header format="currency">Berekende prijs</s-table-header>
                <s-table-header>Eigen verkoopprijs</s-table-header>
                <s-table-header format="numeric">Winst</s-table-header>
                <s-table-header format="numeric">Marge</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.variants.map((v, i) => {
                  const manual = data.manualVariants.includes(v.externalId);
                  return (
                    <s-table-row key={v.externalId}>
                      <s-table-cell>
                        <s-stack direction="block" gap="none">
                          <s-text type="strong">{v.label}</s-text>
                          <s-text color="subdued">{v.sku ?? v.externalId}</s-text>
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{v.calc?.breakdown ? formatMoney(v.calc.breakdown.landedCost, data.currency) : "—"}</s-table-cell>
                      <s-table-cell>{v.auto?.breakdown ? formatMoney(v.auto.breakdown.sellingPrice, data.currency) : "—"}</s-table-cell>
                      <s-table-cell>
                        <s-text-field
                          label={`Eigen prijs ${v.label}`}
                          labelAccessibilityVisibility="exclusive"
                          name={`price_${i}`}
                          defaultValue={manual && v.calc?.breakdown ? v.calc.breakdown.sellingPrice.replace(".", ",") : ""}
                          placeholder="Automatisch"
                          disabled={!data.editable || !v.auto?.ok}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-text tone={v.calc?.breakdown && Number(v.calc.breakdown.estimatedProfit) < 0 ? "critical" : "auto"}>
                          {v.calc?.breakdown ? formatMoney(v.calc.breakdown.estimatedProfit, data.currency) : "—"}
                        </s-text>
                      </s-table-cell>
                      <s-table-cell>{v.calc?.breakdown ? formatPercent(v.calc.breakdown.grossMarginPercent) : "—"}</s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-section>

          <s-section heading="Afbeeldingen">
            <s-stack direction="block" gap="base">
              <s-paragraph color="subdued">
                Kies welke foto’s je gebruikt en in welke volgorde; de eerste is de hoofdfoto. Afmetingen worden in je browser
                gemeten (aanbevolen minimaal {RECOMMENDED_MIN_IMAGE_SIZE} px).
              </s-paragraph>
              <ImagesEditor data={data} state={images} setState={setImages} />
            </s-stack>
          </s-section>

          {product.variants.length > 1 && includedUrls.length > 0 ? (
            <s-section heading="Foto per variant">
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
                {data.variants.map((v, i) => (
                  <s-select key={v.externalId} label={v.label} name={`vimg_${i}`} value={includedUrls.includes(variantImageDefault(v)) ? variantImageDefault(v) : ""} disabled={!data.editable}>
                    <s-option value="">Geen eigen foto</s-option>
                    {includedUrls.map((url, n) => (
                      <s-option key={url} value={url}>
                        {n === 0 ? "Hoofdfoto" : `Foto ${n + 1}`}
                      </s-option>
                    ))}
                  </s-select>
                ))}
              </s-grid>
            </s-section>
          ) : (
            data.variants.map((v, i) => <input key={v.externalId} type="hidden" name={`vimg_${i}`} value={includedUrls.includes(variantImageDefault(v)) ? variantImageDefault(v) : ""} />)
          )}

          <s-section heading="Collecties">
            {data.collectionsError ? (
              <s-banner tone="warning">{data.collectionsError}</s-banner>
            ) : data.collections.length === 0 ? (
              <s-paragraph color="subdued">Geen handmatige collecties gevonden in je winkel. Slimme collecties vullen zichzelf via hun regels.</s-paragraph>
            ) : (
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="small-200">
                {data.collections.map((c) => (
                  <s-checkbox key={c.id} label={c.title} name="collections" value={c.id} defaultChecked={overrides.collections?.includes(c.id) ?? false} disabled={!data.editable} />
                ))}
              </s-grid>
            )}
          </s-section>

          {data.editable ? (
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" type="submit" loading={busy}>
                Wijzigingen opslaan
              </s-button>
              <s-button href={`/app/import/${data.jobId}`} disabled={busy}>
                Terug naar voorbeeld
              </s-button>
            </s-stack>
          ) : null}
        </s-stack>
      </fetcher.Form>

      <s-section slot="aside" heading="Oorspronkelijke gegevens">
        <s-stack direction="block" gap="small-200">
          <s-text color="subdued">Blijven altijd apart bewaard.</s-text>
          <s-text type="strong">{product.title}</s-text>
          <s-text>ID: {product.externalId}</s-text>
          {product.sourceUrl ? (
            <s-link href={product.sourceUrl} target="_blank">
              Bron bekijken
            </s-link>
          ) : null}
          <s-text>
            Valuta {product.currencyCode} · {product.variants.length} variant(en) · {product.images.length} foto(’s)
          </s-text>
          {data.ruleName ? <s-text>Prijsregel: {data.ruleName}</s-text> : null}
        </s-stack>
      </s-section>

      {data.flags.length ? (
        <s-section slot="aside" heading="Controles">
          <s-stack direction="block" gap="small-200">
            {data.flags.map((f) => (
              <s-stack key={f.code} direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={SEVERITY_TONE[f.severity]}>{f.severity === "error" ? "Blokkeert" : f.severity === "warning" ? "Controleren" : "Info"}</s-badge>
                <s-text>{f.message}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
