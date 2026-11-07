import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ModuleStatus } from "../components/ModuleStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AiStudioPage() {
  return (
    <ModuleStatus
      heading="AI Studio"
      phase={5}
      intro="Bereid producten professioneel voor op de Nederlandse markt met Claude of OpenAI, met je eigen API-sleutel. De AI verzint geen eigenschappen, keurmerken, materialen, levertijden of veiligheidsclaims; de oorspronkelijke leveranciersgegevens blijven apart bewaard."
      features={[
        "Producttitels en beschrijvingen verbeteren en vertalen naar correct Nederlands",
        "SEO-titels en metabeschrijvingen",
        "Productkenmerken structureren, categorieën en tags voorstellen",
        "Doelgroepomschrijving en marketingteksten",
        "AI-alt-teksten voor afbeeldingen",
        "Ontbrekende productinformatie signaleren",
      ]}
      meanwhile={{ label: "API-sleutel van Claude of OpenAI veilig opslaan en testen", href: "/app/settings" }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
