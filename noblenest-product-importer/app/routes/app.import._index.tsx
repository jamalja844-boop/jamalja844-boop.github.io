import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { requireShop } from "../services/shop.server";
import { createPreview } from "../services/import.server";
import { importFromUrl } from "../services/url-import.server";
import { logAudit } from "../services/audit.server";
import { checkImportUpload, defaultUploadLimits } from "../lib/security/upload";
import { detectFormat } from "../lib/import/sources";
import { SOURCE_LABEL_PATTERN } from "../lib/import/normalize";
import { formatDateTime, JOB_STATUS } from "../lib/format";
import { useElementEvent } from "../hooks/use-element-event";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const [jobs, ruleCount] = await Promise.all([
    db.importJob.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.pricingRule.count({ where: { shopId: shop.id, isActive: true } }),
  ]);
  return {
    hasPricingRule: ruleCount > 0,
    maxMb: Math.round(defaultUploadLimits().maxBytes / 1024 / 1024),
    jobs: jobs.map((j) => ({
      id: j.id,
      sourceName: j.sourceName,
      status: j.status,
      totalItems: j.totalItems,
      succeededItems: j.succeededItems,
      failedItems: j.failedItems,
      skippedItems: j.skippedItems,
      createdAt: j.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user, redirect } = await requireShop(request);
  const limits = defaultUploadLimits();

  // Grote uploads weigeren voordat de body in het geheugen wordt gelezen.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > limits.maxBytes + 64 * 1024) {
    return { error: `Het bestand is groter dan ${Math.round(limits.maxBytes / 1024 / 1024)} MB.` };
  }

  const form = await request.formData();

  if (form.get("intent") === "url") {
    const result = await importFromUrl(shop, user?.id ?? null, String(form.get("url") ?? ""));
    if (result.kind === "PREVIEW") {
      const target = `/app/import/${result.jobId}`;
      return redirect ? redirect(target) : Response.redirect(target, 303);
    }
    return { urlMessage: result.message, urlTone: result.tone };
  }

  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Kies een CSV-, XML- of JSON-bestand om te uploaden." };
  const label = String(form.get("label") ?? "").trim().toLowerCase() || null;
  if (label && !SOURCE_LABEL_PATTERN.test(label)) {
    return { error: "Bronlabel: alleen kleine letters, cijfers en streepjes (max. 40 tekens)." };
  }
  const imageRightsFromSupplier = form.get("imageRights") === "true";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImportUpload({ name: file.name, size: file.size, type: file.type }, bytes, limits);
  if (!check.ok) {
    await logAudit({ shopId: shop.id, actorUserId: user?.id, level: "WARNING", action: "import.upload.rejected", message: `Upload geweigerd: ${check.error}` });
    return { error: check.error };
  }

  try {
    const format = detectFormat(file.name, check.text!);
    if (!format) return { error: "Bestandsformaat niet herkend. Gebruik .csv, .xml (Google-productfeed) of .json." };
    const { job } = await createPreview({
      shop,
      userId: user?.id ?? null,
      sourceName: file.name,
      format,
      text: check.text!,
      idPrefix: label,
      // Voor CSV staat de toestemming per product in de kolom image_rights.
      imageRightsFromSupplier: format !== "CSV" && imageRightsFromSupplier,
    });
    const target = `/app/import/${job.id}`;
    return redirect ? redirect(target) : Response.redirect(target, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await logAudit({ shopId: shop.id, actorUserId: user?.id, level: "ERROR", action: "import.preview.failed", message: `Inlezen mislukt: ${message}` });
    return { error: `Het bestand kon niet worden ingelezen: ${message}` };
  }
};

export default function ImportPage() {
  const { jobs, hasPricingRule, maxMb } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const urlFetcher = useFetcher<typeof action>();
  const uploading = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const urlResult = urlFetcher.data && "urlMessage" in urlFetcher.data ? urlFetcher.data : null;

  const labelRef = useRef<HTMLElementTagNameMap["s-text-field"]>(null);
  const rightsRef = useRef<HTMLElementTagNameMap["s-checkbox"]>(null);
  const dropZoneRef = useElementEvent<HTMLElementTagNameMap["s-drop-zone"]>("change", (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("file", file, file.name);
    data.append("label", labelRef.current?.value ?? "");
    data.append("imageRights", String(rightsRef.current?.checked ?? false));
    fetcher.submit(data, { method: "post", encType: "multipart/form-data" });
  });

  return (
    <s-page heading="Importeren" inlineSize="large">
      {!hasPricingRule ? (
        <s-banner tone="warning" heading="Nog geen prijsregel">
          <s-paragraph>
            Zonder actieve prijsregel kan Noblenest geen verkoopprijzen berekenen en kunnen producten niet worden geïmporteerd.{" "}
            <s-link href="/app/pricing">Prijsregel instellen</s-link>
          </s-paragraph>
        </s-banner>
      ) : null}

      <s-section heading="Product importeren via URL">
        <urlFetcher.Form method="post">
          <input type="hidden" name="intent" value="url" />
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
              <s-url-field label="Productlink of feed-URL" name="url" required placeholder="https://leverancier.nl/producten/…" autocomplete="off" />
              <s-button variant="primary" type="submit" loading={urlFetcher.state !== "idle"}>
                Controleren en voorbeeld maken
              </s-button>
            </s-grid>
            {urlResult ? (
              <s-banner tone={urlResult.urlTone === "critical" ? "critical" : urlResult.urlTone === "warning" ? "warning" : "info"}>{urlResult.urlMessage}</s-banner>
            ) : null}
            <s-text color="subdued">
              Werkt voor producten uit je gekoppelde feeds en voor directe links naar een productfeed (.xml/.json). Noblenest haalt
              geen gegevens van losse webpagina’s op.
            </s-text>
          </s-stack>
        </urlFetcher.Form>
      </s-section>

      <s-section heading="Producten importeren uit een bestand">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Upload een CSV-export, XML-productfeed (Google Merchant Center-formaat) of JSON-feed van je leverancier. Je
            krijgt eerst een voorbeeld met prijzen, varianten, foto’s en controles. Pas na jouw akkoord worden de
            geselecteerde producten als concept in Shopify aangemaakt.
          </s-paragraph>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
            <s-text-field
              ref={labelRef}
              label="Bronlabel (optioneel)"
              placeholder="bijv. linnenhuis"
              details="Voorkomt botsende ID’s tussen leveranciers. Gebruik per leverancier steeds hetzelfde label."
            />
            <s-checkbox
              ref={rightsRef}
              label="Leverancier staat gebruik van feedafbeeldingen toe"
              details="Alleen voor XML/JSON. Bij CSV geldt de kolom image_rights per product."
            />
          </s-grid>
          <s-drop-zone
            ref={dropZoneRef}
            label="Importbestand"
            accept=".csv,.xml,.json,text/csv,application/xml,text/xml,application/json"
            accessibilityLabel="Upload een CSV-, XML- of JSON-bestand met producten"
            disabled={uploading}
            error={error ?? undefined}
          >
            <s-stack direction="block" gap="small-200" alignItems="center">
              <s-text type="strong">{uploading ? "Bestand wordt ingelezen…" : "Sleep je bestand hierheen of klik om te kiezen"}</s-text>
              <s-text color="subdued">Maximaal {maxMb} MB · CSV (komma/puntkomma/tab), XML of JSON · UTF-8 of Excel</s-text>
            </s-stack>
          </s-drop-zone>
          {uploading ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-spinner size="base" accessibilityLabel="Bezig met inlezen" />
              <s-text>Producten, prijzen en controles worden voorbereid…</s-text>
            </s-stack>
          ) : null}
        </s-stack>
      </s-section>

      <s-section heading="Feed van je leverancier koppelen">
        <s-stack direction="block" gap="small-200">
          <s-paragraph color="subdued">
            Heeft je leverancier een feed-URL? Koppel die eenmalig bij Leveranciers. Daarna kun je de catalogus doorzoeken en
            selecties importeren zonder bestanden te downloaden.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button href="/app/suppliers">Feedbron koppelen</s-button>
            <s-button href="/app/search" variant="tertiary">Producten zoeken</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Handmatig invoeren">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-paragraph color="subdued">Geen bestand of feed? Voer een product zelf in, met dezelfde prijs- en kwaliteitscontroles.</s-paragraph>
          <s-button href="/app/import/manual">Product handmatig invoeren</s-button>
        </s-stack>
      </s-section>

      <s-section heading="Importgeschiedenis">
        {jobs.length === 0 ? (
          <s-paragraph color="subdued">Nog geen imports.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Bestand</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Producten</s-table-header>
              <s-table-header format="numeric">Geïmporteerd</s-table-header>
              <s-table-header format="numeric">Overgeslagen</s-table-header>
              <s-table-header format="numeric">Mislukt</s-table-header>
              <s-table-header>Datum</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>
                    <s-link href={`/app/import/${job.id}`}>{job.sourceName}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={JOB_STATUS[job.status]?.tone}>{JOB_STATUS[job.status]?.label ?? job.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{job.totalItems}</s-table-cell>
                  <s-table-cell>{job.succeededItems}</s-table-cell>
                  <s-table-cell>{job.skippedItems}</s-table-cell>
                  <s-table-cell>{job.failedItems}</s-table-cell>
                  <s-table-cell>{formatDateTime(job.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Voorbeeldbestanden">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Test de importflow zonder leverancier: varianten, USD-inkoop, ontbrekende foto en een product zonder
            inkoopprijs.
          </s-paragraph>
          <a href="/voorbeeld/noblenest-voorbeeldcatalogus.csv" download="noblenest-voorbeeldcatalogus.csv">
            Voorbeeld-CSV (6 producten)
          </a>
          <a href="/voorbeeld/noblenest-voorbeeldfeed.xml" download="noblenest-voorbeeldfeed.xml">
            Voorbeeld-XML-feed (Google-formaat)
          </a>
          <a href="/voorbeeld/noblenest-voorbeeldfeed.json" download="noblenest-voorbeeldfeed.json">
            Voorbeeld-JSON-feed
          </a>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="CSV-kolommen">
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">Verplicht</s-text>
          <s-text>external_id, title</s-text>
          <s-text type="strong">Aanbevolen</s-text>
          <s-text>cost_price, currency, shipping_cost, description, image_urls, image_rights, stock_quantity, delivery_days_min/max, safety_info, eu_responsible_person</s-text>
          <s-text type="strong">Varianten</s-text>
          <s-text>Eén regel per variant met dezelfde external_id, plus option1_name / option1_value (max. 3 opties).</s-text>
          <s-text color="subdued">Nederlandse kolomnamen (titel, inkoopprijs, voorraad …) worden ook herkend.</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
