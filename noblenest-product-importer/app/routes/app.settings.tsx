import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShop } from "../services/shop.server";
import { deleteSecret, getSecret, getSecretStatus, getSetting, setSecret, setSetting, type SecretKey } from "../services/settings.server";
import { getExchangeRates } from "../services/exchange-rates.server";
import { testAiConnection } from "../services/ai-providers.server";
import { logAudit } from "../services/audit.server";
import { isEncryptionConfigured } from "../lib/security/crypto.server";
import { formatDateTime } from "../lib/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, session } = await requireShop(request);
  const [prefs, ai, fx, secrets, rates] = await Promise.all([
    getSetting(shop.id, "import.preferences"),
    getSetting(shop.id, "ai.settings"),
    getSetting(shop.id, "pricing.exchangeRates"),
    getSecretStatus(shop.id),
    getExchangeRates(shop.id),
  ]);
  return {
    shopDomain: shop.shopDomain,
    currency: shop.currencyCode ?? "EUR",
    scopes: session.scope?.split(",") ?? [],
    encryptionConfigured: isEncryptionConfigured(),
    prefs,
    ai,
    manualRatesText: Object.entries(fx.manualRates).map(([k, v]) => `${k}=${v}`).join("\n"),
    secrets,
    rates: { source: rates.source, date: rates.date, warning: rates.warning, sample: ["USD", "GBP", "CNY", "CHF", "SEK"].map((c) => [c, rates.rates[c] ?? null] as const) },
  };
};

const SECRET_FOR: Record<string, SecretKey> = { ANTHROPIC: "ai.anthropic.apiKey", OPENAI: "ai.openai.apiKey" };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const audit = (action: string, message: string) => logAudit({ shopId: shop.id, actorUserId: user?.id, action, entityType: "AppSetting", message });

  try {
    switch (intent) {
      case "ai": {
        const provider = String(form.get("provider") ?? "");
        await setSetting(shop.id, "ai.settings", {
          provider: provider === "ANTHROPIC" || provider === "OPENAI" ? provider : null,
          anthropicModel: String(form.get("anthropicModel") ?? "").trim() || undefined,
          openaiModel: String(form.get("openaiModel") ?? "").trim(),
          language: "nl",
        });
        for (const [p, key] of Object.entries(SECRET_FOR)) {
          const value = String(form.get(`${p}_apiKey`) ?? "").trim();
          if (value) {
            if (!isEncryptionConfigured()) return { ok: false, message: "Versleutelingssleutel ontbreekt op de server; API-sleutel niet opgeslagen." };
            await setSecret(shop.id, key, value);
            await audit("settings.secret.saved", `API-sleutel voor ${p === "ANTHROPIC" ? "Claude" : "OpenAI"} opgeslagen (versleuteld).`);
          }
        }
        await audit("settings.ai.updated", "AI-instellingen bijgewerkt.");
        return { ok: true, message: "AI-instellingen opgeslagen." };
      }
      case "deleteSecret": {
        const key = SECRET_FOR[String(form.get("provider"))];
        if (!key) return { ok: false, message: "Onbekende provider." };
        await deleteSecret(shop.id, key);
        await audit("settings.secret.deleted", "API-sleutel verwijderd.");
        return { ok: true, message: "API-sleutel verwijderd." };
      }
      case "testAi": {
        const provider = String(form.get("provider"));
        const key = SECRET_FOR[provider];
        if (!key) return { ok: false, message: "Onbekende provider." };
        const secret = await getSecret(shop.id, key);
        if (!secret) return { ok: false, message: "Er is nog geen API-sleutel opgeslagen voor deze provider." };
        const result = await testAiConnection(provider as "ANTHROPIC" | "OPENAI", secret);
        await logAudit({ shopId: shop.id, actorUserId: user?.id, level: result.ok ? "INFO" : "WARNING", action: "settings.ai.tested", message: result.message });
        return result;
      }
      case "import": {
        const tags = String(form.get("extraTags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        await setSetting(shop.id, "import.preferences", {
          defaultVendor: String(form.get("defaultVendor") ?? "").trim() || null,
          extraTags: tags,
          importAsDraft: true,
        });
        await audit("settings.import.updated", "Importvoorkeuren bijgewerkt.");
        return { ok: true, message: "Importvoorkeuren opgeslagen." };
      }
      case "rates": {
        const manualRates: Record<string, number> = {};
        for (const line of String(form.get("manualRates") ?? "").split(/\r?\n/)) {
          if (!line.trim()) continue;
          const m = line.trim().match(/^([A-Za-z]{3})\s*[=:]\s*([0-9]+(?:[.,][0-9]+)?)$/);
          if (!m) return { ok: false, message: `Ongeldige regel "${line.trim()}". Gebruik bijv. USD=1,08` };
          manualRates[m[1]!.toUpperCase()] = Number(m[2]!.replace(",", "."));
        }
        await setSetting(shop.id, "pricing.exchangeRates", { manualRates });
        await audit("settings.rates.updated", "Handmatige wisselkoersen bijgewerkt.");
        return { ok: true, message: "Wisselkoersen opgeslagen." };
      }
      default:
        return { ok: false, message: "Onbekende actie." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Opslaan mislukt." };
  }
};

function useToastResult(data: { ok: boolean; message: string } | undefined) {
  const shopify = useAppBridge();
  useEffect(() => {
    if (data?.message) shopify.toast.show(data.message, { isError: !data.ok });
  }, [data, shopify]);
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const aiFetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  const ratesFetcher = useFetcher<typeof action>();
  const secretFetcher = useFetcher<typeof action>();
  useToastResult(aiFetcher.data);
  useToastResult(importFetcher.data);
  useToastResult(ratesFetcher.data);
  useToastResult(secretFetcher.data);

  const providers = [
    { id: "ANTHROPIC", name: "Claude (Anthropic)", secret: data.secrets["ai.anthropic.apiKey"], modelField: "anthropicModel", model: data.ai.anthropicModel },
    { id: "OPENAI", name: "OpenAI", secret: data.secrets["ai.openai.apiKey"], modelField: "openaiModel", model: data.ai.openaiModel },
  ] as const;

  return (
    <s-page heading="Instellingen" inlineSize="base">
      <s-section heading="Shopify">
        <s-stack direction="block" gap="small-200">
          <s-text>
            Gekoppelde winkel: <s-text type="strong">{data.shopDomain}</s-text> · valuta {data.currency}
          </s-text>
          <s-text color="subdued">API-rechten: {data.scopes.length ? data.scopes.join(", ") : "—"}</s-text>
          <s-text color="subdued">Noblenest gebruikt alleen productrechten en publiceert nooit automatisch.</s-text>
        </s-stack>
      </s-section>

      <s-section heading="AI-providers">
        <aiFetcher.Form method="post">
          <input type="hidden" name="intent" value="ai" />
          <s-stack direction="block" gap="base">
            <s-paragraph color="subdued">
              Gebruik je eigen API-sleutel van Claude of OpenAI voor Nederlandse producttitels, beschrijvingen en SEO (AI
              Studio, fase 5). Sleutels worden versleuteld opgeslagen en nooit getoond of naar de browser gestuurd. Aan
              het gebruik van deze API’s zijn kosten verbonden bij de provider.
            </s-paragraph>
            <s-select label="Standaardprovider" name="provider" value={data.ai.provider ?? ""}>
              <s-option value="">Geen (AI uitgeschakeld)</s-option>
              <s-option value="ANTHROPIC">Claude (Anthropic)</s-option>
              <s-option value="OPENAI">OpenAI</s-option>
            </s-select>
            {providers.map((p) => (
              <s-box key={p.id} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text type="strong">{p.name}</s-text>
                    <s-badge tone={p.secret.configured ? "success" : "neutral"}>
                      {p.secret.configured ? `Sleutel opgeslagen ${p.secret.hint ?? ""}` : "Geen sleutel"}
                    </s-badge>
                    {p.secret.updatedAt ? <s-text color="subdued">bijgewerkt {formatDateTime(p.secret.updatedAt)}</s-text> : null}
                  </s-stack>
                  <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                    <s-password-field
                      label={p.secret.configured ? "Nieuwe API-sleutel (optioneel)" : "API-sleutel"}
                      name={`${p.id}_apiKey`}
                      autocomplete="off"
                      placeholder={p.secret.configured ? "Leeg laten om te behouden" : ""}
                      disabled={!data.encryptionConfigured}
                    />
                    <s-text-field label="Model" name={p.modelField} defaultValue={p.model} placeholder={p.id === "OPENAI" ? "Modelnaam" : ""} />
                  </s-grid>
                  {p.secret.configured ? (
                    <s-stack direction="inline" gap="base">
                      <s-button
                        loading={secretFetcher.state !== "idle"}
                        onClick={() => secretFetcher.submit({ intent: "testAi", provider: p.id }, { method: "post" })}
                      >
                        Verbinding testen
                      </s-button>
                      <s-button
                        tone="critical"
                        variant="tertiary"
                        onClick={() => {
                          if (window.confirm(`API-sleutel van ${p.name} verwijderen?`)) {
                            secretFetcher.submit({ intent: "deleteSecret", provider: p.id }, { method: "post" });
                          }
                        }}
                      >
                        Sleutel verwijderen
                      </s-button>
                    </s-stack>
                  ) : null}
                </s-stack>
              </s-box>
            ))}
            <s-button variant="primary" type="submit" loading={aiFetcher.state !== "idle"}>
              AI-instellingen opslaan
            </s-button>
          </s-stack>
        </aiFetcher.Form>
      </s-section>

      <s-section heading="Importvoorkeuren">
        <importFetcher.Form method="post">
          <input type="hidden" name="intent" value="import" />
          <s-stack direction="block" gap="base">
            <s-text-field label="Standaard leverancier/merk" name="defaultVendor" defaultValue={data.prefs.defaultVendor ?? ""} details="Wordt gebruikt als het bestand geen leverancier of merk bevat." />
            <s-text-field label="Extra tags bij elke import" name="extraTags" defaultValue={data.prefs.extraTags.join(", ")} details="Komma-gescheiden, bijv. noblenest-import, controleren" />
            <s-text-field label="Productstatus na import" value="Concept (altijd)" disabled details="Noblenest publiceert nooit automatisch." />
            <s-button variant="primary" type="submit" loading={importFetcher.state !== "idle"}>
              Importvoorkeuren opslaan
            </s-button>
          </s-stack>
        </importFetcher.Form>
      </s-section>

      <s-section heading="Wisselkoersen">
        <ratesFetcher.Form method="post">
          <input type="hidden" name="intent" value="rates" />
          <s-stack direction="block" gap="base">
            <s-paragraph color="subdued">
              Bron: Europese Centrale Bank (referentiekoersen, dagelijks bijgewerkt){data.rates.date ? ` — koersen van ${data.rates.date}` : ""}.
              Handmatige koersen hebben voorrang.
            </s-paragraph>
            {data.rates.warning ? <s-banner tone="warning">{data.rates.warning}</s-banner> : null}
            <s-stack direction="inline" gap="small-200">
              {data.rates.sample.map(([c, r]) => (
                <s-badge key={c} tone={r ? "info" : "neutral"}>
                  1 EUR = {r ? r.toLocaleString("nl-NL", { maximumFractionDigits: 4 }) : "?"} {c}
                </s-badge>
              ))}
            </s-stack>
            <s-text-area label="Handmatige koersen" name="manualRates" rows={3} defaultValue={data.manualRatesText} placeholder={"USD=1,08\nCNY=7,80"} details="Eén valuta per regel: VALUTA=koers (aantal eenheden per 1 EUR)." />
            <s-button variant="primary" type="submit" loading={ratesFetcher.state !== "idle"}>
              Wisselkoersen opslaan
            </s-button>
          </s-stack>
        </ratesFetcher.Form>
      </s-section>

      <s-section heading="Taal">
        <s-paragraph>De app en alle AI-teksten zijn in het Nederlands. Andere talen kunnen later worden toegevoegd.</s-paragraph>
      </s-section>

      <s-section heading="Veiligheid en privacy">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={data.encryptionConfigured ? "success" : "critical"}>
              {data.encryptionConfigured ? "Versleuteling actief" : "Versleutelingssleutel ontbreekt"}
            </s-badge>
            <s-text color="subdued">API-sleutels: AES-256-GCM, per winkel gebonden.</s-text>
          </s-stack>
          <s-text color="subdued">Noblenest slaat geen klantgegevens op. Bij verwijdering van de app worden sessies gewist; op verzoek van Shopify (shop/redact) alle winkelgegevens.</s-text>
          <s-text color="subdued">Alle wijzigingen staan in het logboek.</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
