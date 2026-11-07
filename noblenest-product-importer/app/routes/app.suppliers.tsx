import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { SUPPLIER_REGISTRY } from "../services/suppliers.server";
import { INTEGRATION_STATUS } from "../lib/format";

const CAPABILITY_LABELS: Record<string, string> = {
  connectionCheck: "Verbindingscontrole",
  products: "Producten",
  variants: "Varianten",
  prices: "Inkoopprijzen",
  stock: "Voorraad",
  images: "Afbeeldingen",
  shipping: "Verzending & levertijd",
  changeDetection: "Wijzigingen detecteren",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireShop(request);
  return { suppliers: SUPPLIER_REGISTRY };
};

export default function SuppliersPage() {
  const { suppliers } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Leveranciers" inlineSize="large">
      <s-banner tone="info" heading="Alleen officiële en toegestane koppelingen">
        <s-paragraph>
          Noblenest gebruikt uitsluitend officiële API’s, productfeeds of bestanden van leveranciers. Er wordt nooit gescrapet
          en beveiligingen (zoals CAPTCHA’s of anti-botmaatregelen) worden niet omzeild. Zonder officiële koppeling kun je
          altijd een CSV-export van de leverancier importeren.
        </s-paragraph>
      </s-banner>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap="base">
        {suppliers.map((s) => {
          const status = INTEGRATION_STATUS[s.integrationStatus]!;
          const caps = Object.entries(s.capabilities).filter(([, v]) => v).map(([k]) => CAPABILITY_LABELS[k] ?? k);
          return (
            <s-box key={s.key} padding="base" border="base" borderRadius="large" background="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>{s.name}</s-heading>
                  <s-badge tone={status.tone}>{status.label}</s-badge>
                  {s.plannedPhase && s.integrationStatus !== "AVAILABLE" ? <s-badge tone="neutral">Fase {s.plannedPhase}</s-badge> : null}
                </s-stack>
                <s-paragraph>{s.description}</s-paragraph>
                {caps.length ? (
                  <s-stack direction="inline" gap="small-200">
                    {caps.map((c) => (
                      <s-chip key={c}>{c}</s-chip>
                    ))}
                  </s-stack>
                ) : (
                  <s-text color="subdued">Nog geen actieve functies.</s-text>
                )}
                {s.key === "csv" ? (
                  <s-button href="/app/import" variant="primary">
                    CSV importeren
                  </s-button>
                ) : s.website ? (
                  <s-link href={s.website} target="_blank">
                    Officiële informatie
                  </s-link>
                ) : null}
              </s-stack>
            </s-box>
          );
        })}
      </s-grid>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
