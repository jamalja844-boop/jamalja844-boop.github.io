import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ModuleStatus } from "../components/ModuleStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function BulkPage() {
  return (
    <ModuleStatus
      heading="Bulkimport"
      phase={6}
      intro="Grote catalogi importeren via een achtergrondwachtrij (Redis + BullMQ), zodat imports doorlopen terwijl je verder werkt."
      features={[
        "Meerdere productlinks en XML/JSON-feeds tegelijk",
        "Importwachtrij met voortgang per batch",
        "Pauzeren, hervatten en annuleren",
        "Automatisch opnieuw proberen bij tijdelijke fouten",
        "Shopify Bulk Operations waar passend",
        "Rapportage van geslaagde en mislukte imports",
      ]}
      meanwhile={{ label: "CSV-import met selectie, batches (25 per keer), annuleren en opnieuw proberen", href: "/app/import" }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
