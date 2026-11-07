import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { getDashboardStats } from "../services/dashboard.server";
import { getSecretStatus } from "../services/settings.server";
import { isEncryptionConfigured } from "../lib/security/crypto.server";
import { formatDateTime, JOB_STATUS } from "../lib/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const [stats, secrets] = await Promise.all([getDashboardStats(shop.id), getSecretStatus(shop.id)]);
  return {
    shopName: shop.name ?? shop.shopDomain,
    stats: {
      ...stats,
      recentJobs: stats.recentJobs.map((j) => ({
        id: j.id,
        sourceName: j.sourceName,
        status: j.status,
        totalItems: j.totalItems,
        succeededItems: j.succeededItems,
        failedItems: j.failedItems,
        createdAt: j.createdAt.toISOString(),
      })),
    },
    aiConfigured: secrets["ai.anthropic.apiKey"].configured || secrets["ai.openai.apiKey"].configured,
    encryptionConfigured: isEncryptionConfigured(),
  };
};

function Metric({ label, value, tone, help }: { label: string; value: number; tone?: "critical" | "warning"; help: string }) {
  return (
    <s-box padding="base" background="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>
          <s-text type="strong" tone={value > 0 && tone ? tone : "auto"}>
            {value.toLocaleString("nl-NL")}
          </s-text>
        </s-heading>
        <s-text color="subdued">{help}</s-text>
      </s-stack>
    </s-box>
  );
}

export default function Dashboard() {
  const { shopName, stats, aiConfigured, encryptionConfigured } = useLoaderData<typeof loader>();
  const setupSteps = [
    { done: stats.pricingRules > 0, label: "Stel een prijsregel in", href: "/app/pricing" },
    { done: encryptionConfigured && aiConfigured, label: "Koppel een AI-provider (optioneel)", href: "/app/settings" },
    { done: stats.imported > 0, label: "Importeer je eerste producten als concept", href: "/app/import" },
  ];
  const setupComplete = setupSteps.every((s) => s.done);

  return (
    <s-page heading="Noblenest" inlineSize="large">
      <s-button slot="primary-action" variant="primary" href="/app/import">
        Producten importeren
      </s-button>

      <s-section padding="base">
        <s-stack direction="block" gap="small-200">
          <s-heading>Welkom terug{shopName ? `, ${shopName}` : ""}</s-heading>
          <s-paragraph color="subdued">
            Importeer, verfijn en beheer leveranciersproducten. Alles komt eerst als concept in je winkel — er wordt niets
            gepubliceerd zonder jouw akkoord.
          </s-paragraph>
        </s-stack>
      </s-section>

      {!encryptionConfigured ? (
        <s-banner tone="critical" heading="Versleutelingssleutel ontbreekt">
          <s-paragraph>
            Stel NOBLENEST_ENCRYPTION_KEY in op de server voordat je API-sleutels opslaat. Zie de installatiehandleiding.
          </s-paragraph>
        </s-banner>
      ) : null}

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
        <Metric label="Geïmporteerd" value={stats.imported} help="Producten gekoppeld aan Shopify" />
        <Metric label="Concepten" value={stats.drafts} help="Wachten op jouw controle" />
        <Metric label="Actief" value={stats.active} help="Door jou gepubliceerd" />
        <Metric label="Zonder afbeelding" value={stats.withoutImage} tone="warning" help="Foto's toevoegen vóór publicatie" />
        <Metric label="Mislukte imports" value={stats.failedImportItems} tone="critical" help="Opnieuw te proberen" />
        <Metric label="Synchronisatiefouten" value={stats.syncErrors} tone="critical" help="Voorraad en prijzen" />
      </s-grid>

      <s-section heading="Recente imports">
        {stats.recentJobs.length === 0 ? (
          <s-stack direction="block" gap="base" alignItems="center">
            <s-paragraph color="subdued">Nog geen imports. Begin met een CSV-bestand of de voorbeeldcatalogus.</s-paragraph>
            <s-button href="/app/import">Eerste import starten</s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Bestand</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Producten</s-table-header>
              <s-table-header format="numeric">Geïmporteerd</s-table-header>
              <s-table-header format="numeric">Mislukt</s-table-header>
              <s-table-header>Datum</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.recentJobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>
                    <s-link href={`/app/import/${job.id}`}>{job.sourceName}</s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={JOB_STATUS[job.status]?.tone}>{JOB_STATUS[job.status]?.label ?? job.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{job.totalItems}</s-table-cell>
                  <s-table-cell>{job.succeededItems}</s-table-cell>
                  <s-table-cell>{job.failedItems}</s-table-cell>
                  <s-table-cell>{formatDateTime(job.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {!setupComplete ? (
        <s-section slot="aside" heading="Aan de slag">
          <s-stack direction="block" gap="base">
            {setupSteps.map((step) => (
              <s-stack key={step.label} direction="inline" gap="small-200" alignItems="center">
                <s-icon type={step.done ? "check-circle" : "circle"} tone={step.done ? "success" : "auto"} />
                {step.done ? <s-text color="subdued">{step.label}</s-text> : <s-link href={step.href}>{step.label}</s-link>}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      ) : null}

      <s-section slot="aside" heading="Veilig importeren">
        <s-unordered-list>
          <s-list-item>Producten worden altijd als concept aangemaakt.</s-list-item>
          <s-list-item>Duplicaten worden herkend en overgeslagen.</s-list-item>
          <s-list-item>Afbeeldingen alleen met bevestigde beeldrechten.</s-list-item>
          <s-list-item>Elke actie staat in het logboek.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
