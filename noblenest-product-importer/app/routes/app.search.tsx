import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ModuleStatus } from "../components/ModuleStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SearchPage() {
  return (
    <ModuleStatus
      heading="Producten zoeken"
      phase={3}
      intro="Doorzoek de catalogi van gekoppelde leveranciers vanuit Noblenest. Dit werkt alleen voor leveranciers met een officiële API of productfeed."
      features={[
        "Leveranciers selecteren en catalogi doorzoeken",
        "Zoekresultaten filteren op prijs, levertijd, voorraad en categorie",
        "Producten naast elkaar vergelijken",
        "Direct doorzetten naar het importvoorbeeld",
      ]}
      meanwhile={{ label: "Bekijk welke leveranciers beschikbaar zijn", href: "/app/suppliers" }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
