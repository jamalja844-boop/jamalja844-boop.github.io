import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/search">Producten zoeken</s-link>
        <s-link href="/app/import">Importeren</s-link>
        <s-link href="/app/bulk">Bulkimport</s-link>
        <s-link href="/app/products">Mijn producten</s-link>
        <s-link href="/app/ai">AI Studio</s-link>
        <s-link href="/app/pricing">Prijsregels</s-link>
        <s-link href="/app/suppliers">Leveranciers</s-link>
        <s-link href="/app/sync">Synchronisatie</s-link>
        <s-link href="/app/settings">Instellingen</s-link>
        <s-link href="/app/logs">Logboeken</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify heeft React Router nodig om bepaalde responses af te vangen, zodat hun headers behouden blijven.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
