import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import { requireShop } from "../services/shop.server";
import { cancelImport, getJob, processJob, retryFailed, setSelection, startImport, type ItemFlags } from "../services/import.server";
import type { ProductPricing } from "../services/pricing.server";
import type { NormalizedProduct, RowError } from "../lib/import/types";
import type { ItemOverrides } from "../lib/import/overrides";
import { formatDateTime, formatMoney, formatPercent, formatPriceRange, ITEM_STATUS, JOB_STATUS, SEVERITY_TONE, STOCK_STATUS } from "../lib/format";
import { useElementEvent } from "../hooks/use-element-event";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const job = await getJob(shop.id, params.jobId!);
  if (!job) throw new Response("Import niet gevonden", { status: 404 });
  const currency = shop.currencyCode ?? "EUR";

  return {
    currency,
    shopDomain: shop.shopDomain,
    job: {
      id: job.id,
      sourceName: job.sourceName,
      status: job.status,
      totalItems: job.totalItems,
      succeededItems: job.succeededItems,
      failedItems: job.failedItems,
      skippedItems: job.skippedItems,
      imageRightsConfirmed: job.imageRightsConfirmed,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      parseErrors: (job.parseErrors ?? []) as unknown as RowError[],
    },
    items: job.items.map((item) => {
      const product = item.payload as unknown as NormalizedProduct;
      const overrides = (item.overrides ?? {}) as ItemOverrides;
      const manualPrices = ((item.pricing as { manualVariants?: string[] } | null)?.manualVariants ?? []).length;
      const flags = item.flags as unknown as ItemFlags;
      const pricing = item.pricing as unknown as ProductPricing | null;
      const firstCalc = pricing ? Object.values(pricing.variants).find((c) => c.ok) : undefined;
      const costs = product.variants.map((v) => v.costPrice).filter((c): c is string => c !== null).map(Number);
      return {
        id: item.id,
        externalId: item.externalId,
        title: overrides.title ?? item.title,
        edited: Object.keys(overrides).length > 0 || manualPrices > 0,
        status: item.status,
        selected: item.selected,
        attempts: item.attempts,
        lastError: item.lastError,
        shopifyProductId: item.shopifyProductId,
        blocking: flags.blocking,
        flags: flags.flags,
        variantCount: product.variants.length,
        optionSummary: product.options.map((o) => `${o.name} (${o.values.length})`).join(", "),
        imageCount: product.images.length,
        firstImage: overrides.images ? overrides.images[0] ?? null : product.images[0]?.url ?? null,
        imagesNeedConsent: product.images.some((i) => i.rights === "UNVERIFIED"),
        stockStatus: product.stockStatus,
        sourceCurrency: product.currencyCode,
        minCost: costs.length ? Math.min(...costs) : null,
        ruleName: pricing?.ruleName ?? null,
        minPrice: pricing?.minPrice ?? null,
        maxPrice: pricing?.maxPrice ?? null,
        breakdown: firstCalc?.breakdown ?? null,
      };
    }),
  };
};

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("start"), selectedIds: z.string(), imageRightsConfirmed: z.enum(["true", "false"]) }),
  z.object({ intent: z.literal("continue") }),
  z.object({ intent: z.literal("retry") }),
  z.object({ intent: z.literal("cancel") }),
]);

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop, user, client } = await requireShop(request);
  const parsed = actionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { ok: false, message: "Ongeldig verzoek." };
  const jobId = params.jobId!;
  const userId = user?.id ?? null;

  try {
    switch (parsed.data.intent) {
      case "start": {
        const ids = z.array(z.string()).max(10000).parse(JSON.parse(parsed.data.selectedIds));
        await setSelection(shop.id, jobId, ids);
        const result = await startImport(shop.id, jobId, client, {
          imageRightsConfirmed: parsed.data.imageRightsConfirmed === "true",
          userId,
        });
        return { ok: true, message: resultMessage(result.status, result.byStatus.IMPORTED ?? 0) };
      }
      case "continue": {
        const job = await getJob(shop.id, jobId);
        const result = await processJob(shop.id, jobId, client, { imageRightsConfirmed: job?.imageRightsConfirmed ?? false, userId });
        return { ok: true, message: resultMessage(result.status, result.byStatus.IMPORTED ?? 0) };
      }
      case "retry": {
        const result = await retryFailed(shop.id, jobId, client, { imageRightsConfirmed: false, userId });
        return { ok: true, message: resultMessage(result.status, result.byStatus.IMPORTED ?? 0) };
      }
      case "cancel":
        await cancelImport(shop.id, jobId, userId);
        return { ok: true, message: "Import geannuleerd." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Er ging iets mis." };
  }
};

function resultMessage(status: string, imported: number) {
  if (status === "PAUSED") return `${imported} product(en) geïmporteerd. Klik op Doorgaan voor de volgende reeks.`;
  if (status === "COMPLETED") return `Klaar: ${imported} product(en) als concept geïmporteerd.`;
  if (status === "COMPLETED_WITH_ERRORS") return `${imported} product(en) geïmporteerd; sommige producten zijn mislukt.`;
  if (status === "FAILED") return "De import is mislukt. Bekijk de foutmeldingen en probeer opnieuw.";
  return JOB_STATUS[status]?.label ?? status;
}

type Item = ReturnType<typeof useLoaderData<typeof loader>>["items"][number];

function SelectCheckbox({ item, checked, onToggle }: { item: Item; checked: boolean; onToggle: (id: string, value: boolean) => void }) {
  const ref = useElementEvent<HTMLElementTagNameMap["s-checkbox"]>("change", (e) => onToggle(item.id, e.currentTarget.checked));
  return (
    <s-checkbox
      ref={ref}
      accessibilityLabel={`Selecteer ${item.title}`}
      checked={checked}
      disabled={item.blocking || item.status !== "PENDING"}
    />
  );
}

export default function ImportJobPage() {
  const { job, items, currency, shopDomain } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const isPreview = job.status === "PREVIEW";

  const selectable = useMemo(() => items.filter((i) => !i.blocking && i.status === "PENDING"), [items]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.filter((i) => i.selected).map((i) => i.id)));
  const [imageConsent, setImageConsent] = useState(false);
  const consentRef = useElementEvent<HTMLElementTagNameMap["s-checkbox"]>("change", (e) => setImageConsent(e.currentTarget.checked));

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

  const selectedItems = items.filter((i) => selected.has(i.id));
  const needsConsent = selectedItems.some((i) => i.imagesNeedConsent);
  const submit = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });
  const productAdminUrl = (gid: string) => `https://admin.shopify.com/store/${shopDomain.replace(".myshopify.com", "")}/products/${gid.split("/").pop()}`;

  const warnings = items.filter((i) => i.flags.length > 0);
  const failedCount = items.filter((i) => i.status === "FAILED").length;

  return (
    <s-page heading={job.sourceName} inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/import">
        Importeren
      </s-link>
      {["PAUSED", "QUEUED", "RUNNING"].includes(job.status) ? (
        <s-button slot="primary-action" variant="primary" loading={busy} onClick={() => submit({ intent: "continue" })}>
          Doorgaan
        </s-button>
      ) : null}
      {failedCount > 0 && ["COMPLETED_WITH_ERRORS", "FAILED", "PAUSED"].includes(job.status) ? (
        <s-button slot="secondary-actions" loading={busy} onClick={() => submit({ intent: "retry" })}>
          Mislukte opnieuw proberen
        </s-button>
      ) : null}
      {["PREVIEW", "QUEUED", "RUNNING", "PAUSED"].includes(job.status) ? (
        <s-button slot="secondary-actions" tone="critical" disabled={busy} onClick={() => submit({ intent: "cancel" })}>
          Annuleren
        </s-button>
      ) : null}

      <s-section padding="base">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={JOB_STATUS[job.status]?.tone}>{JOB_STATUS[job.status]?.label ?? job.status}</s-badge>
          <s-text color="subdued">Ingelezen op {formatDateTime(job.createdAt)}</s-text>
          <s-text color="subdued">·</s-text>
          <s-text>{job.totalItems} producten</s-text>
          {!isPreview ? (
            <>
              <s-text color="subdued">·</s-text>
              <s-text>{job.succeededItems} geïmporteerd</s-text>
              <s-text color="subdued">·</s-text>
              <s-text>{job.skippedItems} overgeslagen</s-text>
              <s-text color="subdued">·</s-text>
              <s-text tone={job.failedItems ? "critical" : "auto"}>{job.failedItems} mislukt</s-text>
            </>
          ) : null}
        </s-stack>
      </s-section>

      {job.parseErrors.length > 0 ? (
        <s-banner tone="warning" heading={`${job.parseErrors.length} regel(s) konden niet worden ingelezen`}>
          <s-unordered-list>
            {job.parseErrors.slice(0, 15).map((e, idx) => (
              <s-list-item key={idx}>
                Regel {e.row}: {e.message}
              </s-list-item>
            ))}
          </s-unordered-list>
          {job.parseErrors.length > 15 ? <s-paragraph>… en nog {job.parseErrors.length - 15} meer.</s-paragraph> : null}
        </s-banner>
      ) : null}

      {isPreview ? (
        <s-section heading="Controleren en importeren">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Kies welke producten je wilt importeren. Ze worden als <s-text type="strong">concept</s-text> aangemaakt met de
              verkoopprijzen hieronder en zijn niet zichtbaar voor klanten tot jij ze publiceert.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button disabled={busy} onClick={() => setSelected(new Set(selectable.map((i) => i.id)))}>
                Alles selecteren ({selectable.length})
              </s-button>
              <s-button disabled={busy} onClick={() => setSelected(new Set())}>
                Niets selecteren
              </s-button>
            </s-stack>
            {needsConsent ? (
              <s-checkbox
                ref={consentRef}
                checked={imageConsent}
                label="Ik bevestig dat ik het recht heb om de productafbeeldingen te gebruiken"
                details="Voor sommige geselecteerde producten heeft de leverancier de beeldrechten niet bevestigd. Zonder jouw bevestiging worden die afbeeldingen niet geïmporteerd."
              />
            ) : null}
            <s-button
              variant="primary"
              loading={busy}
              disabled={selected.size === 0}
              onClick={() =>
                submit({
                  intent: "start",
                  selectedIds: JSON.stringify([...selected]),
                  imageRightsConfirmed: String(needsConsent && imageConsent),
                })
              }
            >
              {selected.size === 0 ? "Selecteer producten om te importeren" : `${selected.size} product(en) als concept importeren`}
            </s-button>
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Producten" padding="none">
        <s-table>
          <s-table-header-row>
            {isPreview ? <s-table-header>Selecteren</s-table-header> : null}
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Varianten</s-table-header>
            <s-table-header format="currency">Inkoop</s-table-header>
            <s-table-header format="currency">Kostprijs</s-table-header>
            <s-table-header format="currency">Verkoopprijs</s-table-header>
            <s-table-header format="numeric">Marge</s-table-header>
            <s-table-header>Voorraad</s-table-header>
            <s-table-header listSlot="secondary">Status</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {items.map((item) => (
              <s-table-row key={item.id}>
                {isPreview ? (
                  <s-table-cell>
                    <SelectCheckbox item={item} checked={selected.has(item.id)} onToggle={toggle} />
                  </s-table-cell>
                ) : null}
                <s-table-cell>
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-thumbnail src={item.firstImage ?? undefined} alt={item.title} size="small" />
                    <s-stack direction="block" gap="none">
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-text type="strong">{item.title}</s-text>
                        {item.edited ? <s-badge tone="info">Bewerkt</s-badge> : null}
                      </s-stack>
                      <s-text color="subdued">
                        {item.externalId} · {item.imageCount} foto{item.imageCount === 1 ? "" : "’s"}
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  {item.variantCount}
                  {item.optionSummary ? <s-text color="subdued"> · {item.optionSummary}</s-text> : null}
                </s-table-cell>
                <s-table-cell>{item.minCost !== null ? formatMoney(item.minCost, item.sourceCurrency) : "—"}</s-table-cell>
                <s-table-cell>{item.breakdown ? formatMoney(item.breakdown.landedCost, currency) : "—"}</s-table-cell>
                <s-table-cell>{formatPriceRange(item.minPrice, item.maxPrice, currency)}</s-table-cell>
                <s-table-cell>{item.breakdown ? formatPercent(item.breakdown.grossMarginPercent) : "—"}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={STOCK_STATUS[item.stockStatus]?.tone}>{STOCK_STATUS[item.stockStatus]?.label}</s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="block" gap="small-200">
                    <s-badge tone={item.blocking && isPreview ? "critical" : ITEM_STATUS[item.status]?.tone}>
                      {item.blocking && isPreview && item.status === "PENDING" ? "Niet importeerbaar" : ITEM_STATUS[item.status]?.label}
                    </s-badge>
                    {item.lastError && item.status === "FAILED" ? <s-text tone="critical">{item.lastError}</s-text> : null}
                    {item.shopifyProductId ? (
                      <s-link href={productAdminUrl(item.shopifyProductId)} target="_blank">
                        Openen in Shopify
                      </s-link>
                    ) : null}
                    {isPreview && item.status === "PENDING" && !item.blocking ? (
                      <s-link href={`/app/import/${job.id}/item/${item.id}`}>Bewerken</s-link>
                    ) : null}
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      {warnings.length > 0 ? (
        <s-section heading="Controles per product">
          <s-stack direction="block" gap="base">
            {warnings.map((item) => (
              <s-box key={item.id} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text type="strong">{item.title}</s-text>
                  <s-stack direction="block" gap="small-100">
                    {item.flags.map((flag) => (
                      <s-stack key={flag.code} direction="inline" gap="small-200" alignItems="center">
                        <s-badge tone={SEVERITY_TONE[flag.severity]}>
                          {flag.severity === "error" ? "Blokkeert" : flag.severity === "warning" ? "Controleren" : "Info"}
                        </s-badge>
                        <s-text>{flag.message}</s-text>
                      </s-stack>
                    ))}
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      ) : null}

      <s-section slot="aside" heading="Prijsopbouw (voorbeeld)">
        {(() => {
          const sample = items.find((i) => i.breakdown);
          if (!sample?.breakdown) return <s-paragraph color="subdued">Geen berekende prijzen.</s-paragraph>;
          const b = sample.breakdown;
          const rows: [string, string][] = [
            ["Inkoopprijs", formatMoney(b.costPrice, currency)],
            ["Verzendkosten", formatMoney(b.shippingCost, currency)],
            ["Invoerkosten", formatMoney(b.importDuty, currency)],
            ["Overige kosten", formatMoney(b.otherCosts, currency)],
            ["Kostprijs", formatMoney(b.landedCost, currency)],
            ["Verkoopprijs excl. btw", formatMoney(b.netPrice, currency)],
            ["Btw", formatMoney(b.vatAmount, currency)],
            ["Prijs in Shopify", formatMoney(b.sellingPrice, currency)],
            ["Transactiekosten", formatMoney(Number(b.paymentFees) + Number(b.platformFees), currency)],
            ["Geschatte winst", formatMoney(b.estimatedProfit, currency)],
            ["Brutomarge", formatPercent(b.grossMarginPercent)],
          ];
          return (
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">
                {sample.title} — regel: {sample.ruleName}
              </s-text>
              {rows.map(([label, value]) => (
                <s-grid key={label} gridTemplateColumns="1fr auto" gap="small-200">
                  <s-text>{label}</s-text>
                  <s-text type={label === "Prijs in Shopify" ? "strong" : "generic"}>{value}</s-text>
                </s-grid>
              ))}
            </s-stack>
          );
        })()}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
