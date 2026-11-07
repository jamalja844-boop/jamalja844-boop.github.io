import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { requireShop } from "../services/shop.server";
import { deletePricingRule, listPricingRules, pricingRuleFormSchema, savePricingRule, toRuleCandidate } from "../services/pricing.server";
import { logAudit } from "../services/audit.server";
import { calculatePrice } from "../lib/pricing/calculator";
import { formatMoney, formatPercent, ROUNDING_LABEL, SCOPE_LABEL, STRATEGY_LABEL } from "../lib/format";
import { useElementEvent } from "../hooks/use-element-event";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const [rules, suppliers] = await Promise.all([
    listPricingRules(shop.id),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    currency: shop.currencyCode ?? "EUR",
    suppliers,
    rules: rules.map((r) => ({ ...toRuleCandidate(r), supplierName: r.supplier?.name ?? null })),
  };
};

const DECIMAL_FIELDS = [
  "value", "minimumPrice", "defaultShippingCost", "importDutyPercent", "paymentFeePercent",
  "paymentFeeFixed", "platformFeePercent", "otherCosts", "vatPercent",
] as const;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, user } = await requireShop(request);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    if (intent === "delete") {
      const id = String(form.get("ruleId") ?? "");
      await deletePricingRule(shop.id, id);
      await logAudit({ shopId: shop.id, actorUserId: user?.id, action: "pricing.rule.deleted", entityType: "PricingRule", entityId: id, message: "Prijsregel verwijderd." });
      return { ok: true, message: "Prijsregel verwijderd." };
    }

    const raw: Record<string, unknown> = {
      name: form.get("name") ?? "",
      isActive: form.get("isActive") !== null,
      priority: form.get("priority") || "100",
      scope: form.get("scope") ?? "GLOBAL",
      category: form.get("category") ?? "",
      supplierId: form.get("supplierId") ?? "",
      strategy: form.get("strategy") ?? "PERCENTAGE_MARKUP",
      rounding: form.get("rounding") ?? "NONE",
      pricesIncludeVat: form.get("pricesIncludeVat") !== null,
    };
    for (const f of DECIMAL_FIELDS) raw[f] = String(form.get(f) ?? "");
    const parsed = pricingRuleFormSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, message: `${first?.path.join(".") || "Formulier"}: ${first?.message}` };
    }
    const ruleId = String(form.get("ruleId") ?? "") || undefined;
    const rule = await savePricingRule(shop.id, parsed.data, ruleId);
    await logAudit({
      shopId: shop.id,
      actorUserId: user?.id,
      action: ruleId ? "pricing.rule.updated" : "pricing.rule.created",
      entityType: "PricingRule",
      entityId: rule.id,
      message: `Prijsregel "${rule.name}" ${ruleId ? "bijgewerkt" : "aangemaakt"}.`,
    });
    return { ok: true, message: ruleId ? "Prijsregel bijgewerkt." : "Prijsregel aangemaakt.", savedId: rule.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Opslaan mislukt." };
  }
};

type Rule = ReturnType<typeof useLoaderData<typeof loader>>["rules"][number];

function describe(rule: Rule, currency: string) {
  const v = rule.strategy === "FIXED_MARKUP" ? formatMoney(rule.value as string, currency) : formatPercent(rule.value as string);
  return `${STRATEGY_LABEL[rule.strategy]}: ${v}`;
}

function RuleForm({ rule, suppliers, onDone }: { rule: Rule | null; suppliers: { id: string; name: string }[]; onDone: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const [scope, setScope] = useState(rule?.scope ?? "GLOBAL");
  const scopeRef = useElementEvent<HTMLElementTagNameMap["s-select"]>("change", (e) => setScope(e.currentTarget.value as Rule["scope"]));

  useEffect(() => {
    if (fetcher.data?.ok) onDone();
  }, [fetcher.data, onDone]);

  const d = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

  return (
    <fetcher.Form method="post">
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
      <s-stack direction="block" gap="base">
        {fetcher.data && !fetcher.data.ok ? <s-banner tone="critical">{fetcher.data.message}</s-banner> : null}
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-text-field label="Naam" name="name" defaultValue={rule?.name ?? ""} required placeholder="Bijv. Standaard woonaccessoires" />
          <s-text-field label="Prioriteit" name="priority" defaultValue={String(rule?.priority ?? 100)} details="Lager = gaat voor" />
        </s-grid>
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-select ref={scopeRef} label="Geldt voor" name="scope" value={scope}>
            <s-option value="GLOBAL">{SCOPE_LABEL.GLOBAL}</s-option>
            <s-option value="CATEGORY">{SCOPE_LABEL.CATEGORY}</s-option>
            <s-option value="SUPPLIER">{SCOPE_LABEL.SUPPLIER}</s-option>
          </s-select>
          {scope === "CATEGORY" ? (
            <s-text-field label="Producttype" name="category" defaultValue={rule?.category ?? ""} placeholder="Bijv. Verlichting" />
          ) : scope === "SUPPLIER" ? (
            <s-select label="Leverancier" name="supplierId" value={rule?.supplierId ?? ""}>
              <s-option value="">Kies…</s-option>
              {suppliers.map((s) => (
                <s-option key={s.id} value={s.id}>
                  {s.name}
                </s-option>
              ))}
            </s-select>
          ) : (
            <s-box />
          )}
        </s-grid>
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-select label="Prijsstrategie" name="strategy" value={rule?.strategy ?? "PERCENTAGE_MARKUP"}>
            <s-option value="PERCENTAGE_MARKUP">{STRATEGY_LABEL.PERCENTAGE_MARKUP}</s-option>
            <s-option value="FIXED_MARKUP">{STRATEGY_LABEL.FIXED_MARKUP}</s-option>
            <s-option value="TARGET_MARGIN">{STRATEGY_LABEL.TARGET_MARGIN}</s-option>
          </s-select>
          <s-text-field label="Waarde" name="value" defaultValue={d(rule?.value ?? "100")} required details="Bedrag (€) of percentage (%)" />
          <s-select label="Afronding" name="rounding" value={rule?.rounding ?? "END_95"}>
            <s-option value="NONE">{ROUNDING_LABEL.NONE}</s-option>
            <s-option value="END_95">{ROUNDING_LABEL.END_95}</s-option>
            <s-option value="END_99">{ROUNDING_LABEL.END_99}</s-option>
          </s-select>
        </s-grid>
        <s-heading>Kosten</s-heading>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <s-text-field label="Standaard verzendkosten (€)" name="defaultShippingCost" defaultValue={d(rule?.defaultShippingCost)} details="Als de leverancier niets opgeeft" />
          <s-text-field label="Invoerkosten (%)" name="importDutyPercent" defaultValue={d(rule?.importDutyPercent)} details="Over inkoop + verzending" />
          <s-text-field label="Betaalkosten (%)" name="paymentFeePercent" defaultValue={d(rule?.paymentFeePercent)} />
          <s-text-field label="Betaalkosten vast (€)" name="paymentFeeFixed" defaultValue={d(rule?.paymentFeeFixed)} />
          <s-text-field label="Platformkosten (%)" name="platformFeePercent" defaultValue={d(rule?.platformFeePercent)} />
          <s-text-field label="Overige kosten (€)" name="otherCosts" defaultValue={d(rule?.otherCosts)} details="Bijv. verpakking" />
          <s-text-field label="Minimumprijs (€)" name="minimumPrice" defaultValue={d(rule?.minimumPrice)} />
        </s-grid>
        <s-heading>Btw</s-heading>
        <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="center">
          <s-text-field
            label="Btw-tarief (%)"
            name="vatPercent"
            defaultValue={d(rule?.vatPercent ?? "21")}
            details="Per belastingcontext, bijv. 21 (hoog) of 9 (laag) in Nederland. Leeg = niet ingesteld (wordt gemeld)."
          />
          <s-switch label="Prijzen in Shopify zijn inclusief btw" name="pricesIncludeVat" value="true" defaultChecked={rule?.pricesIncludeVat ?? true} />
        </s-grid>
        <s-switch label="Regel is actief" name="isActive" value="true" defaultChecked={rule?.isActive ?? true} />
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" type="submit" loading={busy}>
            {rule ? "Wijzigingen opslaan" : "Prijsregel opslaan"}
          </s-button>
          <s-button onClick={onDone} disabled={busy}>
            Annuleren
          </s-button>
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

function Calculator({ rules, currency }: { rules: Rule[]; currency: string }) {
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? "");
  const [cost, setCost] = useState("25");
  const [shipping, setShipping] = useState("");
  const ruleRef = useElementEvent<HTMLElementTagNameMap["s-select"]>("change", (e) => setRuleId(e.currentTarget.value));
  const costRef = useElementEvent<HTMLElementTagNameMap["s-text-field"]>("input", (e) => setCost(e.currentTarget.value));
  const shipRef = useElementEvent<HTMLElementTagNameMap["s-text-field"]>("input", (e) => setShipping(e.currentTarget.value));
  const rule = rules.find((r) => r.id === ruleId) ?? rules[0];

  const result = useMemo(() => {
    if (!rule) return null;
    const norm = (s: string) => (s.trim() === "" ? null : s.replace(",", "."));
    return calculatePrice({ costPrice: norm(cost), currencyCode: currency, shippingCost: norm(shipping) }, rule, { shopCurrency: currency, exchangeRates: {} });
  }, [rule, cost, shipping, currency]);

  if (!rule) return <s-paragraph color="subdued">Maak eerst een prijsregel aan.</s-paragraph>;
  return (
    <s-stack direction="block" gap="base">
      <s-select ref={ruleRef} label="Prijsregel" value={rule.id}>
        {rules.map((r) => (
          <s-option key={r.id} value={r.id}>
            {r.name}
          </s-option>
        ))}
      </s-select>
      <s-text-field ref={costRef} label="Inkoopprijs (€)" defaultValue={cost} />
      <s-text-field ref={shipRef} label="Verzendkosten (€)" defaultValue={shipping} placeholder="Leeg = standaard uit regel" />
      {result?.breakdown ? (
        <s-stack direction="block" gap="small-200">
          {[
            ["Kostprijs", formatMoney(result.breakdown.landedCost, currency)],
            ["Prijs in Shopify", formatMoney(result.breakdown.sellingPrice, currency)],
            ["Excl. btw", formatMoney(result.breakdown.netPrice, currency)],
            ["Geschatte winst", formatMoney(result.breakdown.estimatedProfit, currency)],
            ["Brutomarge", formatPercent(result.breakdown.grossMarginPercent)],
          ].map(([l, v]) => (
            <s-grid key={l} gridTemplateColumns="1fr auto" gap="small-200">
              <s-text>{l}</s-text>
              <s-text type={l === "Prijs in Shopify" ? "strong" : "generic"}>{v}</s-text>
            </s-grid>
          ))}
        </s-stack>
      ) : null}
      {result?.issues.map((i) => (
        <s-text key={i.code} tone={i.severity === "error" ? "critical" : "caution"}>
          {i.message}
        </s-text>
      ))}
    </s-stack>
  );
}

export default function PricingPage() {
  const { rules, suppliers, currency } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const deleteFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const editing = searchParams.get("edit");
  const editingRule = editing && editing !== "new" ? rules.find((r) => r.id === editing) ?? null : null;
  const close = () => setSearchParams({});

  useEffect(() => {
    if (deleteFetcher.data?.message) shopify.toast.show(deleteFetcher.data.message, { isError: !deleteFetcher.data.ok });
  }, [deleteFetcher.data, shopify]);

  return (
    <s-page heading="Prijsregels" inlineSize="large">
      {!editing ? (
        <s-button slot="primary-action" variant="primary" onClick={() => setSearchParams({ edit: "new" })}>
          Prijsregel toevoegen
        </s-button>
      ) : null}

      {editing ? (
        <s-section heading={editingRule ? `Bewerken: ${editingRule.name}` : "Nieuwe prijsregel"}>
          <RuleForm key={editing} rule={editingRule} suppliers={suppliers} onDone={close} />
        </s-section>
      ) : null}

      <s-section heading="Actieve en inactieve regels" padding="none">
        {rules.length === 0 ? (
          <s-box padding="base">
            <s-paragraph color="subdued">
              Nog geen prijsregels. Een prijsregel bepaalt hoe Noblenest de verkoopprijs berekent uit inkoopprijs, kosten,
              marge en btw.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Naam</s-table-header>
              <s-table-header>Geldt voor</s-table-header>
              <s-table-header>Strategie</s-table-header>
              <s-table-header>Afronding</s-table-header>
              <s-table-header format="numeric">Btw</s-table-header>
              <s-table-header format="numeric">Prioriteit</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Acties</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>{rule.name}</s-table-cell>
                  <s-table-cell>
                    {rule.scope === "CATEGORY" ? `Categorie: ${rule.category}` : rule.scope === "SUPPLIER" ? `Leverancier: ${rule.supplierName}` : SCOPE_LABEL.GLOBAL}
                  </s-table-cell>
                  <s-table-cell>{describe(rule, currency)}</s-table-cell>
                  <s-table-cell>{ROUNDING_LABEL[rule.rounding]}</s-table-cell>
                  <s-table-cell>{rule.vatPercent === null ? "Niet ingesteld" : `${formatPercent(rule.vatPercent as string)}${rule.pricesIncludeVat ? " incl." : " excl."}`}</s-table-cell>
                  <s-table-cell>{rule.priority}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={rule.isActive ? "success" : "neutral"}>{rule.isActive ? "Actief" : "Inactief"}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button variant="tertiary" onClick={() => setSearchParams({ edit: rule.id })}>
                        Bewerken
                      </s-button>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => {
                          if (window.confirm(`Prijsregel "${rule.name}" verwijderen?`)) {
                            deleteFetcher.submit({ intent: "delete", ruleId: rule.id }, { method: "post" });
                          }
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

      <s-section slot="aside" heading="Rekenvoorbeeld">
        <Calculator rules={rules} currency={currency} />
      </s-section>
      <s-section slot="aside" heading="Hoe wordt gerekend?">
        <s-unordered-list>
          <s-list-item>Kostprijs = inkoop + verzending + invoerkosten + overige kosten.</s-list-item>
          <s-list-item>Opslag of doelmarge wordt berekend over de prijs excl. btw.</s-list-item>
          <s-list-item>Doelmarge houdt rekening met betaal- en platformkosten.</s-list-item>
          <s-list-item>Afronding gaat altijd naar boven (,95 of ,99).</s-list-item>
          <s-list-item>Buitenlandse valuta via ECB-koersen (Instellingen).</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
