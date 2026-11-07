/** Nederlandse weergave van bedragen, datums en statussen. */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: string | number | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("nl-NL", { style: "currency", currency });
    moneyFormatters.set(currency, f);
  }
  return f.format(n);
}

export function formatPriceRange(min: string | null, max: string | null, currency = "EUR"): string {
  if (!min) return "—";
  return min === max || !max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}

const dateTime = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : dateTime.format(d);
}

export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
}

type Tone = "info" | "success" | "warning" | "critical" | "neutral" | "caution" | "auto";

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  PREVIEW: { label: "Voorbeeld", tone: "info" },
  QUEUED: { label: "In wachtrij", tone: "info" },
  RUNNING: { label: "Bezig", tone: "info" },
  PAUSED: { label: "Gepauzeerd", tone: "caution" },
  COMPLETED: { label: "Voltooid", tone: "success" },
  COMPLETED_WITH_ERRORS: { label: "Voltooid met fouten", tone: "warning" },
  FAILED: { label: "Mislukt", tone: "critical" },
  CANCELLED: { label: "Geannuleerd", tone: "neutral" },
};

export const ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Klaar voor import", tone: "info" },
  IMPORTING: { label: "Bezig", tone: "info" },
  IMPORTED: { label: "Geïmporteerd (concept)", tone: "success" },
  SKIPPED_DUPLICATE: { label: "Duplicaat", tone: "neutral" },
  FAILED: { label: "Mislukt", tone: "critical" },
  CANCELLED: { label: "Overgeslagen", tone: "neutral" },
};

export const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  IN_STOCK: { label: "Op voorraad", tone: "success" },
  OUT_OF_STOCK: { label: "Niet op voorraad", tone: "warning" },
  UNKNOWN: { label: "Voorraad onbekend", tone: "neutral" },
};

export const SEVERITY_TONE: Record<string, Tone> = { error: "critical", warning: "warning", info: "info" };

export const INTEGRATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Beschikbaar", tone: "success" },
  REQUIRES_CREDENTIALS: { label: "API-sleutel nodig", tone: "caution" },
  REQUIRES_APPROVAL: { label: "Goedkeuring leverancier nodig", tone: "caution" },
  NOT_AVAILABLE: { label: "Geen toegestane koppeling", tone: "neutral" },
  PLANNED: { label: "Gepland", tone: "info" },
};

export const STRATEGY_LABEL: Record<string, string> = {
  FIXED_MARKUP: "Vast opslagbedrag",
  PERCENTAGE_MARKUP: "Percentage opslag",
  TARGET_MARGIN: "Doelmarge",
};

export const ROUNDING_LABEL: Record<string, string> = {
  NONE: "Niet afronden",
  END_95: "Afronden op ,95",
  END_99: "Afronden op ,99",
};

export const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: "Alle producten",
  CATEGORY: "Categorie (producttype)",
  SUPPLIER: "Leverancier",
};

export const LOG_LEVEL: Record<string, { label: string; tone: Tone }> = {
  INFO: { label: "Info", tone: "info" },
  WARNING: { label: "Waarschuwing", tone: "warning" },
  ERROR: { label: "Fout", tone: "critical" },
};
