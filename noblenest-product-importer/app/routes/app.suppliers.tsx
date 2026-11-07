import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { SUPPLIER_REGISTRY } from "../services/suppliers.server";
import { checkFeedSource, createFeedSource, deleteFeedSource, feedSourceFormSchema, getFeedCatalog, listFeedSources } from "../services/feed-sources.server";
import { createPreview } from "../services/import.server";
import { isEncryptionConfigured } from "../lib/security/crypto.server";
import { CONNECTION_STATUS, formatDateTime, INTEGRATION_STATUS } from "../lib/format";

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
  const { shop } = await requireShop(request);
  return {
    suppliers: SUPPLIER_REGISTRY,
    feeds: await listFeedSources(shop.id),
    encryptionConfigured: isEncryptionConfigured(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user, redirect } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const userId = user?.id ?? null;
  const id = String(form.get("id") ?? "");
  const defaultCurrency = shop.currencyCode ?? "EUR";

  try {
    switch (intent) {
      case "create": {
        if (!isEncryptionConfigured()) return { ok: false, message: "Versleutelingssleutel ontbreekt op de server; feed-URL niet opgeslagen." };
        const parsed = feedSourceFormSchema.safeParse({
          name: form.get("name") ?? "",
          format: form.get("format") ?? "XML",
          url: form.get("url") ?? "",
          label: form.get("label") ?? "",
          imageRights: form.get("imageRights") !== null,
        });
        if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Ongeldige invoer." };
        const row = await createFeedSource(shop.id, parsed.data, userId);
        const check = await checkFeedSource(shop.id, row.id, userId, { defaultCurrency });
        return { ok: true, message: `Feedbron opgeslagen. ${check.message}`, created: true };
      }
      case "check":
        return await checkFeedSource(shop.id, id, userId, { defaultCurrency });
      case "delete":
        await deleteFeedSource(shop.id, id, userId);
        return { ok: true, message: "Feedbron verwijderd." };
      case "import": {
        const { source, config, parsed } = await getFeedCatalog(shop.id, id, { defaultCurrency, refresh: true });
        const { job } = await createPreview({ shop, userId, sourceName: `Feed: ${source.name}`, format: config.format, parsed });
        const target = `/app/import/${job.id}`;
        return redirect ? redirect(target) : Response.redirect(target, 303);
      }
      default:
        return { ok: false, message: "Onbekende actie." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Er ging iets mis." };
  }
};

function FeedForm({ onDone }: { onDone: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.data && "created" in fetcher.data && fetcher.data.created) onDone();
  }, [fetcher.data, onDone]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="create" />
      <s-stack direction="block" gap="base">
        {fetcher.data && !fetcher.data.ok ? <s-banner tone="critical">{fetcher.data.message}</s-banner> : null}
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-text-field label="Naam" name="name" required placeholder="Bijv. Linnenhuis productfeed" />
          <s-select label="Formaat" name="format" value="XML">
            <s-option value="XML">XML (Google Merchant Center)</s-option>
            <s-option value="JSON">JSON (Noblenest-formaat)</s-option>
          </s-select>
        </s-grid>
        <s-url-field
          label="Feed-URL"
          name="url"
          required
          placeholder="https://…"
          details="Alleen https. De URL wordt versleuteld opgeslagen (tokens in de URL blijven geheim) en veilig opgehaald."
        />
        <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
          <s-text-field label="Bronlabel (optioneel)" name="label" placeholder="bijv. linnenhuis" details="Kleine letters, cijfers en streepjes" />
          <s-checkbox label="Leverancier staat gebruik van feedafbeeldingen toe" name="imageRights" value="true" />
        </s-grid>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" type="submit" loading={busy}>
            Opslaan en controleren
          </s-button>
          <s-button onClick={onDone} disabled={busy}>
            Annuleren
          </s-button>
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

export default function SuppliersPage() {
  const { suppliers, feeds, encryptionConfigured } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const adding = searchParams.get("nieuw") === "feed";
  const busyId = fetcher.state !== "idle" ? String(fetcher.formData?.get("id") ?? "") : null;
  const busyIntent = fetcher.state !== "idle" ? String(fetcher.formData?.get("intent") ?? "") : null;

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
  }, [fetcher.data, shopify]);

  const run = (intent: string, id: string) => fetcher.submit({ intent, id }, { method: "post" });

  return (
    <s-page heading="Leveranciers" inlineSize="large">
      {!adding ? (
        <s-button slot="primary-action" variant="primary" disabled={!encryptionConfigured} onClick={() => setSearchParams({ nieuw: "feed" })}>
          Feedbron toevoegen
        </s-button>
      ) : null}

      <s-banner tone="info" heading="Alleen officiële en toegestane koppelingen">
        <s-paragraph>
          Noblenest gebruikt uitsluitend officiële API’s, productfeeds of bestanden van leveranciers. Er wordt nooit gescrapet
          en beveiligingen (zoals CAPTCHA’s of anti-botmaatregelen) worden niet omzeild. Zonder officiële koppeling kun je
          altijd een export van de leverancier importeren.
        </s-paragraph>
      </s-banner>

      {adding ? (
        <s-section heading="Nieuwe feedbron">
          <FeedForm onDone={() => setSearchParams({})} />
        </s-section>
      ) : null}

      <s-section heading="Feedbronnen" padding={feeds.length ? "none" : "base"}>
        {feeds.length === 0 ? (
          <s-stack direction="block" gap="small-200">
            <s-paragraph color="subdued">
              Nog geen feedbronnen. Koppel de productfeed-URL van een leverancier om de catalogus te doorzoeken en selecties
              te importeren.
            </s-paragraph>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Naam</s-table-header>
              <s-table-header>Formaat</s-table-header>
              <s-table-header>Adres</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Producten</s-table-header>
              <s-table-header>Gecontroleerd</s-table-header>
              <s-table-header>Acties</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {feeds.map((feed) => (
                <s-table-row key={feed.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="none">
                      <s-text type="strong">{feed.name}</s-text>
                      {feed.label ? <s-text color="subdued">label: {feed.label}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{feed.format}</s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{feed.host}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-badge tone={CONNECTION_STATUS[feed.status]?.tone}>{CONNECTION_STATUS[feed.status]?.label ?? feed.status}</s-badge>
                      {feed.lastError ? <s-text tone="critical">{feed.lastError}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{feed.productCount ?? "—"}</s-table-cell>
                  <s-table-cell>{formatDateTime(feed.lastCheckedAt)}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button variant="tertiary" loading={busyId === feed.id && busyIntent === "check"} onClick={() => run("check", feed.id)}>
                        Controleren
                      </s-button>
                      <s-button variant="tertiary" href={`/app/search?bron=${feed.id}`}>
                        Doorzoeken
                      </s-button>
                      <s-button variant="tertiary" loading={busyId === feed.id && busyIntent === "import"} onClick={() => run("import", feed.id)}>
                        Alles naar voorbeeld
                      </s-button>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => {
                          if (window.confirm(`Feedbron "${feed.name}" verwijderen? Geïmporteerde producten blijven bestaan.`)) run("delete", feed.id);
                        }}
                      >
                        Verwijderen
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Ondersteunde bronnen">
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
                    <s-button href="/app/import">Bestand importeren</s-button>
                  ) : s.type === "FEED" ? (
                    <s-button disabled={!encryptionConfigured} onClick={() => setSearchParams({ nieuw: "feed" })}>
                      Feedbron toevoegen
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
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
