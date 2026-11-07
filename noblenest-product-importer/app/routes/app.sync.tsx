import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ModuleStatus } from "../components/ModuleStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SyncPage() {
  return (
    <ModuleStatus
      heading="Synchronisatie"
      phase={6}
      intro="Houd voorraad en inkoopprijzen actueel op basis van betrouwbare leveranciersgegevens. Wijzigingen in Shopify gebeuren alleen volgens regels die jij vooraf goedkeurt."
      features={[
        "Handmatig of periodiek synchroniseren (als de leverancier dat ondersteunt)",
        "Alleen voorraad, alleen inkoopprijzen of beide",
        "Waarschuwing bij prijsstijging of als een product niet meer leverbaar is",
        "Optioneel automatisch op niet beschikbaar zetten volgens goedgekeurde regels",
        "Voorraad onbekend als de bron geen actuele voorraad levert",
        "Laatste synchronisatiedatum en resultaat per product",
      ]}
      meanwhile={{ label: "Bekijk je geïmporteerde producten", href: "/app/products" }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
