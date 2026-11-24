import type { OrgRole } from "@/lib/auth/rbac";

export type RiskLevel = "read" | "write" | "sensitive";

export interface ToolDefinition {
  key: string;
  name: string;
  description: string;
  handler: string;
  category: "kennis" | "bedrijfsdata" | "communicatie" | "agenda" | "documenten" | "e-commerce" | "integratie" | "data" | "web" | "hulpmiddel";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  minRole: OrgRole;
  /** Integratie die eerst gekoppeld moet worden (credential-provider). */
  integration?: "google" | "shopify" | "whatsapp" | "exa" | "sql" | "http" | "mcp";
  defaultConfig?: Record<string, unknown>;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const int = (description: string, minimum: number, maximum: number) => ({ type: "integer", description, minimum, maximum });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const collection = str("Naam van de collectie, bijv. klanten, leads, offertes, klachten, facturen, planning, voorraad", { pattern: "^[a-z][a-z_]{1,39}$" });

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    key: "knowledge_search",
    name: "Kennisbank doorzoeken",
    description: "Zoekt relevante fragmenten in de kennisbanken van de organisatie (hybride: vector + trefwoord). Geeft bronnen terug om naar te verwijzen. Gebruik dit voordat je bedrijfsinformatie noemt.",
    handler: "knowledge_search",
    category: "kennis",
    inputSchema: obj({ query: str("Zoekvraag in natuurlijke taal"), top_k: int("Aantal resultaten (1-10)", 1, 10) }, ["query"]),
    outputSchema: obj({ results: { type: "array" }, found: { type: "boolean" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "viewer",
  },
  {
    key: "document_read",
    name: "Document lezen",
    description: "Leest de tekst van één document uit de kennisbank (op document-ID uit een zoekresultaat).",
    handler: "document_read",
    category: "documenten",
    inputSchema: obj({ document_id: str("Document-ID (uuid)", { format: "uuid" }), max_chars: int("Maximaal aantal tekens", 500, 40000) }, ["document_id"]),
    outputSchema: obj({ title: { type: "string" }, text: { type: "string" }, truncated: { type: "boolean" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "viewer",
  },
  {
    key: "records_search",
    name: "Bedrijfsgegevens zoeken",
    description: "Zoekt in de interne bedrijfsgegevens (CRM, offertes, klachten, planning, …) binnen een collectie.",
    handler: "records_search",
    category: "bedrijfsdata",
    inputSchema: obj({ collection, query: str("Zoekterm (optioneel)"), limit: int("Maximaal aantal resultaten", 1, 50) }, ["collection"]),
    outputSchema: obj({ records: { type: "array" }, count: { type: "integer" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
  },
  {
    key: "records_create",
    name: "Bedrijfsgegeven aanmaken",
    description: "Maakt een nieuw item aan in een collectie van de interne bedrijfsgegevens (bijv. een lead, klant of offerteconcept).",
    handler: "records_create",
    category: "bedrijfsdata",
    inputSchema: obj({ collection, title: str("Korte titel", { maxLength: 200 }), data: { type: "object", description: "Velden van het item" } }, ["collection", "title", "data"]),
    outputSchema: obj({ id: { type: "string" }, collection: { type: "string" } }),
    riskLevel: "write",
    requiresApproval: false,
    minRole: "member",
  },
  {
    key: "records_update",
    name: "Bedrijfsgegeven bijwerken",
    description: "Werkt velden of de status van een bestaand item in de interne bedrijfsgegevens bij.",
    handler: "records_update",
    category: "bedrijfsdata",
    inputSchema: obj({ id: str("Record-ID (uuid)", { format: "uuid" }), title: str("Nieuwe titel"), status: str("Nieuwe status"), data: { type: "object", description: "Velden om samen te voegen" } }, ["id"]),
    outputSchema: obj({ id: { type: "string" }, updated: { type: "boolean" } }),
    riskLevel: "write",
    requiresApproval: false,
    minRole: "member",
  },
  {
    key: "records_delete",
    name: "Bedrijfsgegeven verwijderen",
    description: "Verwijdert een item uit de interne bedrijfsgegevens. Vereist altijd goedkeuring van een beheerder.",
    handler: "records_delete",
    category: "bedrijfsdata",
    inputSchema: obj({ id: str("Record-ID (uuid)", { format: "uuid" }), reason: str("Reden van verwijderen") }, ["id", "reason"]),
    outputSchema: obj({ deleted: { type: "boolean" } }),
    riskLevel: "sensitive",
    requiresApproval: true,
    minRole: "admin",
  },
  {
    key: "email_draft",
    name: "E-mailconcept opslaan",
    description: "Slaat een e-mailconcept op ter controle (wordt NIET verzonden). Gebruik dit voor offertes, antwoorden en opvolging.",
    handler: "email_draft",
    category: "communicatie",
    inputSchema: obj({ to: str("Ontvanger (e-mailadres)", { format: "email" }), subject: str("Onderwerp", { maxLength: 300 }), body: str("Tekst van de e-mail") }, ["to", "subject", "body"]),
    outputSchema: obj({ id: { type: "string" }, status: { type: "string" } }),
    riskLevel: "write",
    requiresApproval: false,
    minRole: "member",
  },
  {
    key: "calculator",
    name: "Rekenmachine",
    description: "Berekent een rekenkundige expressie exact (bijv. offerteprijzen: 120 * 4.5 * 1.21). Ondersteunt + - * / ( ) en %.",
    handler: "calculator",
    category: "hulpmiddel",
    inputSchema: obj({ expression: str("Rekenkundige expressie", { maxLength: 300 }) }, ["expression"]),
    outputSchema: obj({ result: { type: "number" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "viewer",
  },
  {
    key: "current_datetime",
    name: "Datum en tijd",
    description: "Geeft de huidige datum, tijd, weekdag en weeknummer in de tijdzone Europe/Amsterdam.",
    handler: "current_datetime",
    category: "hulpmiddel",
    inputSchema: obj({}),
    outputSchema: obj({ iso: { type: "string" }, weekday: { type: "string" }, week: { type: "integer" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "viewer",
  },
  {
    key: "http_request",
    name: "Externe REST API",
    description: "Roept een externe REST API aan op een vooraf toegestaan domein. GET is lezen; POST/PUT/PATCH/DELETE vereisen goedkeuring.",
    handler: "http_request",
    category: "integratie",
    inputSchema: obj({
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      url: str("Volledige https-URL", { format: "uri" }),
      body: { type: "object", description: "JSON-body (optioneel)" },
    }, ["method", "url"]),
    outputSchema: obj({ status: { type: "integer" }, body: {} }),
    riskLevel: "write",
    requiresApproval: true,
    minRole: "developer",
    integration: "http",
    defaultConfig: { allowed_domains: [] },
  },
  {
    key: "sql_query",
    name: "SQL-database (alleen lezen)",
    description: "Voert een alleen-lezen SELECT-query uit op een gekoppelde externe PostgreSQL-database.",
    handler: "sql_query",
    category: "data",
    inputSchema: obj({ query: str("SELECT-query", { maxLength: 4000 }) }, ["query"]),
    outputSchema: obj({ rows: { type: "array" }, row_count: { type: "integer" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "developer",
    integration: "sql",
  },
  {
    key: "web_search",
    name: "Webzoekfunctie",
    description: "Zoekt actuele informatie op het web (via Exa) en geeft titels, URL's en fragmenten terug.",
    handler: "web_search",
    category: "web",
    inputSchema: obj({ query: str("Zoekopdracht"), num_results: int("Aantal resultaten", 1, 10) }, ["query"]),
    outputSchema: obj({ results: { type: "array" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
    integration: "exa",
  },
  {
    key: "gmail_send",
    name: "Gmail – e-mail versturen",
    description: "Verstuurt een e-mail via het gekoppelde Gmail-account. Vereist altijd goedkeuring.",
    handler: "gmail_send",
    category: "communicatie",
    inputSchema: obj({ to: str("Ontvanger", { format: "email" }), subject: str("Onderwerp"), body: str("Tekst (platte tekst)") }, ["to", "subject", "body"]),
    outputSchema: obj({ message_id: { type: "string" } }),
    riskLevel: "sensitive",
    requiresApproval: true,
    minRole: "member",
    integration: "google",
  },
  {
    key: "gcal_list_events",
    name: "Google Agenda – afspraken bekijken",
    description: "Haalt afspraken op uit de primaire Google Agenda binnen een periode.",
    handler: "gcal_list_events",
    category: "agenda",
    inputSchema: obj({ from: str("Begin (ISO 8601)", { format: "date-time" }), to: str("Einde (ISO 8601)", { format: "date-time" }) }, ["from", "to"]),
    outputSchema: obj({ events: { type: "array" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
    integration: "google",
  },
  {
    key: "gcal_create_event",
    name: "Google Agenda – afspraak maken",
    description: "Maakt een afspraak in de primaire Google Agenda. Vereist goedkeuring.",
    handler: "gcal_create_event",
    category: "agenda",
    inputSchema: obj({ title: str("Titel"), start: str("Start (ISO 8601)", { format: "date-time" }), end: str("Einde (ISO 8601)", { format: "date-time" }), location: str("Locatie"), description: str("Omschrijving") }, ["title", "start", "end"]),
    outputSchema: obj({ event_id: { type: "string" }, link: { type: "string" } }),
    riskLevel: "sensitive",
    requiresApproval: true,
    minRole: "member",
    integration: "google",
  },
  {
    key: "gdrive_search",
    name: "Google Drive – bestanden zoeken",
    description: "Zoekt bestanden op naam in de gekoppelde Google Drive.",
    handler: "gdrive_search",
    category: "documenten",
    inputSchema: obj({ query: str("Zoekterm in bestandsnaam"), limit: int("Aantal", 1, 25) }, ["query"]),
    outputSchema: obj({ files: { type: "array" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
    integration: "google",
  },
  {
    key: "shopify_orders",
    name: "Shopify – bestellingen",
    description: "Haalt recente bestellingen op uit de gekoppelde Shopify-winkel (Admin API).",
    handler: "shopify_orders",
    category: "e-commerce",
    inputSchema: obj({ status: { type: "string", enum: ["any", "open", "closed", "cancelled"] }, limit: int("Aantal", 1, 50) }),
    outputSchema: obj({ orders: { type: "array" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
    integration: "shopify",
  },
  {
    key: "shopify_products",
    name: "Shopify – producten",
    description: "Zoekt producten en voorraad in de gekoppelde Shopify-winkel.",
    handler: "shopify_products",
    category: "e-commerce",
    inputSchema: obj({ query: str("Zoekterm (titel)"), limit: int("Aantal", 1, 50) }),
    outputSchema: obj({ products: { type: "array" } }),
    riskLevel: "read",
    requiresApproval: false,
    minRole: "member",
    integration: "shopify",
  },
  {
    key: "whatsapp_send",
    name: "WhatsApp Business – bericht sturen",
    description: "Verstuurt een tekstbericht via de WhatsApp Business Cloud API. Vereist altijd goedkeuring.",
    handler: "whatsapp_send",
    category: "communicatie",
    inputSchema: obj({ to: str("Telefoonnummer in internationaal formaat, bijv. 31612345678", { pattern: "^[1-9][0-9]{7,14}$" }), message: str("Berichttekst", { maxLength: 4000 }) }, ["to", "message"]),
    outputSchema: obj({ message_id: { type: "string" } }),
    riskLevel: "sensitive",
    requiresApproval: true,
    minRole: "member",
    integration: "whatsapp",
  },
];

export function builtinTool(key: string) {
  return BUILTIN_TOOLS.find((t) => t.key === key);
}

/** Integraties en hun benodigde configuratie (getoond in Tool Manager). */
export const INTEGRATIONS = {
  google: {
    name: "Google Workspace (Gmail, Agenda, Drive)",
    fields: [] as { key: string; label: string; secret: boolean; placeholder?: string }[],
    oauth: true,
    help: "Koppel via OAuth. Vereist GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET op de server.",
  },
  shopify: {
    name: "Shopify Admin API",
    fields: [
      { key: "shop_domain", label: "Winkeldomein (bijv. mijnwinkel.myshopify.com)", secret: false, placeholder: "mijnwinkel.myshopify.com" },
      { key: "access_token", label: "Admin API access token", secret: true, placeholder: "shpat_…" },
    ],
    oauth: false,
    help: "Maak in Shopify een custom app met read_orders en read_products en plak het Admin API-token.",
  },
  whatsapp: {
    name: "WhatsApp Business Cloud API",
    fields: [
      { key: "phone_number_id", label: "Phone number ID", secret: false },
      { key: "access_token", label: "Permanent access token", secret: true },
    ],
    oauth: false,
    help: "Te vinden in Meta for Developers → WhatsApp → API Setup.",
  },
  exa: {
    name: "Exa webzoeken",
    fields: [{ key: "api_key", label: "Exa API-sleutel", secret: true }],
    oauth: false,
    help: "Maak een API-sleutel aan op dashboard.exa.ai.",
  },
  sql: {
    name: "Externe PostgreSQL-database",
    fields: [{ key: "connection_string", label: "Connection string (gebruik een alleen-lezen databasegebruiker)", secret: true, placeholder: "postgres://lezer:…@host:5432/db" }],
    oauth: false,
    help: "Gebruik altijd een databasegebruiker met alleen SELECT-rechten.",
  },
  http: {
    name: "Externe REST API",
    fields: [{ key: "authorization", label: "Authorization-header (optioneel, bijv. Bearer …)", secret: true }],
    oauth: false,
    help: "Stel per tool de toegestane domeinen in. Interne/privé-adressen zijn altijd geblokkeerd.",
  },
  mcp: {
    name: "MCP-server (Streamable HTTP)",
    fields: [{ key: "authorization", label: "Authorization-header (optioneel)", secret: true }],
    oauth: false,
    help: "Koppel een remote MCP-server; de tools van de server worden automatisch geregistreerd.",
  },
} as const;

export type IntegrationId = keyof typeof INTEGRATIONS;
