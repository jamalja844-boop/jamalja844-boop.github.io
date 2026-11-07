/**
 * Kwaliteits- en regelgevingscontrole van een product vóór import.
 *
 * Dit is een hulpmiddel om ontbrekende gegevens te signaleren — geen juridisch advies.
 * Relevante kaders: EU-verordening algemene productveiligheid (GPSR, (EU) 2023/988),
 * Nederlandse regels voor koop op afstand (levertijd, retour), btw.
 *
 * - "error":   product kan niet worden geïmporteerd
 * - "warning": product mag als concept worden geïmporteerd, maar vereist controle vóór publicatie
 * - "info":    aandachtspunt
 */
import type { NormalizedProduct } from "./types";

export type FlagSeverity = "error" | "warning" | "info";

export type FlagCode =
  | "NO_COST_PRICE"
  | "NO_IMAGES"
  | "IMAGE_RIGHTS_UNVERIFIED"
  | "NO_DESCRIPTION"
  | "STOCK_UNKNOWN"
  | "OUT_OF_STOCK"
  | "NO_GTIN"
  | "NO_SAFETY_INFO"
  | "NO_EU_RESPONSIBLE_PERSON"
  | "NO_DELIVERY_TIME"
  | "NO_SHIPPING_COST"
  | "NO_VENDOR"
  | "DUPLICATE";

export interface ProductFlag {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
}

export function checkProduct(product: NormalizedProduct): ProductFlag[] {
  const flags: ProductFlag[] = [];
  const add = (code: FlagCode, severity: FlagSeverity, message: string) => flags.push({ code, severity, message });

  const missingCost = product.variants.filter((v) => v.costPrice === null);
  if (missingCost.length > 0) {
    add(
      "NO_COST_PRICE",
      "error",
      missingCost.length === product.variants.length
        ? "Inkoopprijs ontbreekt — verkoopprijs kan niet worden berekend."
        : `Inkoopprijs ontbreekt voor ${missingCost.length} variant(en).`,
    );
  }

  if (product.images.length === 0) {
    add("NO_IMAGES", "warning", "Geen productafbeeldingen.");
  } else if (product.images.some((i) => i.rights === "UNVERIFIED")) {
    add(
      "IMAGE_RIGHTS_UNVERIFIED",
      "warning",
      "Beeldrechten niet bevestigd door de leverancier — afbeeldingen worden alleen geïmporteerd als je de rechten bevestigt.",
    );
  }

  if (!product.descriptionHtml) add("NO_DESCRIPTION", "warning", "Geen productbeschrijving.");

  if (product.stockStatus === "UNKNOWN") add("STOCK_UNKNOWN", "info", "Voorraad onbekend.");
  if (product.stockStatus === "OUT_OF_STOCK") add("OUT_OF_STOCK", "warning", "Product is bij de leverancier niet op voorraad.");

  const hasIdentifier = !!product.gtin || product.variants.some((v) => v.barcode);
  if (!hasIdentifier) add("NO_GTIN", "info", "Geen EAN/GTIN — productidentificatie ontbreekt.");

  if (!product.safetyInfo) {
    add("NO_SAFETY_INFO", "warning", "Geen veiligheidsinformatie of waarschuwingen (GPSR) — controleer vóór publicatie.");
  }
  if (!product.euResponsiblePerson) {
    add(
      "NO_EU_RESPONSIBLE_PERSON",
      "warning",
      "Geen fabrikant/EU-verantwoordelijke vermeld (GPSR) — verplicht voor verkoop in de EU.",
    );
  }

  if (product.deliveryDaysMin === null && product.deliveryDaysMax === null) {
    add("NO_DELIVERY_TIME", "warning", "Levertijd onbekend — verplicht te vermelden bij verkoop op afstand.");
  }
  if (product.shippingCost === null) add("NO_SHIPPING_COST", "info", "Verzendkosten van de leverancier onbekend.");
  if (!product.vendor && !product.brand) add("NO_VENDOR", "info", "Geen leverancier of merk vermeld.");

  return flags;
}

export function hasBlockingFlag(flags: ProductFlag[]): boolean {
  return flags.some((f) => f.severity === "error");
}

export function needsReview(flags: ProductFlag[]): boolean {
  return flags.some((f) => f.severity !== "info");
}
