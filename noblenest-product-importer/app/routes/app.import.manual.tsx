import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { createPreview } from "../services/import.server";
import { parseManualProduct, type ManualProductForm } from "../lib/import/manual";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  return { currency: shop.currencyCode ?? "EUR" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user, redirect } = await requireShop(request);
  const form = await request.formData();
  const t = (name: keyof ManualProductForm) => String(form.get(name) ?? "").slice(0, 10000);
  const input: ManualProductForm = {
    title: t("title"),
    description: t("description"),
    vendor: t("vendor"),
    brand: t("brand"),
    productType: t("productType"),
    tags: t("tags"),
    sku: t("sku"),
    gtin: t("gtin"),
    currency: t("currency"),
    costPrice: t("costPrice"),
    shippingCost: t("shippingCost"),
    deliveryDaysMin: t("deliveryDaysMin"),
    deliveryDaysMax: t("deliveryDaysMax"),
    stockQuantity: t("stockQuantity"),
    weightGrams: t("weightGrams"),
    imageUrls: t("imageUrls"),
    imageRightsConfirmed: form.get("imageRightsConfirmed") !== null,
    safetyInfo: t("safetyInfo"),
    euResponsiblePerson: t("euResponsiblePerson"),
    countryOfOrigin: t("countryOfOrigin"),
    sourceUrl: t("sourceUrl"),
    optionName: t("optionName"),
    optionValues: t("optionValues"),
  };
  if (!input.title.trim()) return { errors: ["Titel is verplicht."] };
  if (!input.costPrice.trim()) return { errors: ["Inkoopprijs is verplicht (nodig voor de prijsberekening)."] };

  const parsed = parseManualProduct(input, shop.currencyCode ?? "EUR");
  if (parsed.products.length === 0) {
    return { errors: parsed.errors.map((e) => e.message.replace(/^\[[^\]]+\]\s*/, "")) };
  }
  const { job } = await createPreview({
    shop,
    userId: user?.id ?? null,
    sourceName: `Handmatig: ${parsed.products[0]!.title}`,
    format: "JSON",
    parsed,
    supplierKey: "manual",
    jobType: "MANUAL",
  });
  const target = `/app/import/${job.id}`;
  return redirect ? redirect(target) : Response.redirect(target, 303);
};

export default function ManualProductPage() {
  const { currency } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <s-page heading="Product handmatig invoeren" inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/import">
        Importeren
      </s-link>
      {result && "errors" in result && result.errors.length ? (
        <s-banner tone="critical" heading="Controleer de invoer">
          <s-unordered-list>
            {result.errors.map((e) => (
              <s-list-item key={e}>{e}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      ) : null}

      <Form method="post">
        <s-stack direction="block" gap="base">
          <s-section heading="Product">
            <s-stack direction="block" gap="base">
              <s-text-field label="Titel" name="title" required maxLength={255} />
              <s-text-area label="Beschrijving" name="description" rows={5} details="Tekst of eenvoudige HTML" />
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field label="Leverancier" name="vendor" />
                <s-text-field label="Merk" name="brand" />
                <s-text-field label="Producttype" name="productType" />
                <s-text-field label="Tags" name="tags" details="Komma-gescheiden" />
                <s-text-field label="SKU" name="sku" details="Ook gebruikt om dubbele invoer te herkennen" />
                <s-text-field label="EAN / GTIN" name="gtin" />
              </s-grid>
            </s-stack>
          </s-section>

          <s-section heading="Inkoop en levering">
            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
              <s-text-field label="Inkoopprijs" name="costPrice" required placeholder="bijv. 24,50" />
              <s-text-field label="Valuta" name="currency" defaultValue={currency} maxLength={3} />
              <s-text-field label="Verzendkosten leverancier" name="shippingCost" />
              <s-text-field label="Levertijd min. (dagen)" name="deliveryDaysMin" />
              <s-text-field label="Levertijd max. (dagen)" name="deliveryDaysMax" />
              <s-text-field label="Voorraad" name="stockQuantity" details="Leeg = onbekend" />
              <s-text-field label="Gewicht (gram)" name="weightGrams" />
              <s-text-field label="Land van herkomst" name="countryOfOrigin" maxLength={2} placeholder="NL" />
            </s-grid>
          </s-section>

          <s-section heading="Varianten (optioneel)">
            <s-grid gridTemplateColumns="1fr 2fr" gap="base">
              <s-text-field label="Optienaam" name="optionName" placeholder="bijv. Kleur" />
              <s-text-field label="Waarden" name="optionValues" placeholder="bijv. Zwart, Goud, Zand" details="Komma-gescheiden; elke waarde wordt een variant met dezelfde inkoopprijs" />
            </s-grid>
          </s-section>

          <s-section heading="Afbeeldingen">
            <s-stack direction="block" gap="base">
              <s-text-area label="Afbeelding-URL’s" name="imageUrls" rows={3} details="Eén https-adres per regel; de eerste is de hoofdfoto" />
              <s-checkbox label="Ik heb het recht deze afbeeldingen te gebruiken" name="imageRightsConfirmed" value="true" />
            </s-stack>
          </s-section>

          <s-section heading="Veiligheid en herkomst">
            <s-stack direction="block" gap="base">
              <s-text-area label="Veiligheidsinformatie en waarschuwingen" name="safetyInfo" rows={3} />
              <s-text-field label="Fabrikant of EU-verantwoordelijke (naam en adres)" name="euResponsiblePerson" />
              <s-url-field label="Bron-URL (optioneel)" name="sourceUrl" />
            </s-stack>
          </s-section>

          <s-stack direction="inline" gap="base">
            <s-button variant="primary" type="submit" loading={busy}>
              Naar importvoorbeeld
            </s-button>
            <s-button href="/app/import">Annuleren</s-button>
          </s-stack>
        </s-stack>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
