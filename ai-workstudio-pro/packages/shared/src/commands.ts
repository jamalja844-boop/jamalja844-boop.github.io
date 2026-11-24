/**
 * Slash-opdrachten van AI Chat. Elke opdracht heeft een eigen server-side handler
 * (zie apps/web/src/lib/chat/commands.ts) – het zijn geen tekstsjablonen.
 */
export type SlashCommandName =
  | "humanize"
  | "rewrite"
  | "translate"
  | "email"
  | "reply"
  | "summarize"
  | "analyze"
  | "create"
  | "code"
  | "browser";

export interface SlashCommandDef {
  name: SlashCommandName;
  label: string;
  description: string;
  /** Uitleg van het argument, bijv. de doeltaal. */
  argHint?: string;
  /** Opdracht werkt ook zonder tekst door het laatste AI-antwoord te gebruiken. */
  usesPreviousAnswer?: boolean;
  category: "schrijven" | "analyse" | "werk";
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "email", label: "E-mail schrijven", description: "Schrijf een zakelijke e-mail met onderwerp en tekst", category: "schrijven" },
  { name: "reply", label: "Antwoord opstellen", description: "Maak een passend antwoord op een ontvangen bericht", category: "schrijven" },
  { name: "rewrite", label: "Herschrijven", description: "Verbeter de formulering, behoud de inhoud", category: "schrijven", usesPreviousAnswer: true },
  { name: "humanize", label: "Natuurlijk maken", description: "Herschrijf natuurlijk en professioneel, zonder AI-toon", category: "schrijven", usesPreviousAnswer: true },
  { name: "translate", label: "Vertalen", description: "Vertaal naar de gekozen taal", argHint: "taal, bijv. engels", category: "schrijven", usesPreviousAnswer: true },
  { name: "summarize", label: "Samenvatten", description: "Vat tekst of een document samen", category: "analyse", usesPreviousAnswer: true },
  { name: "analyze", label: "Analyseren", description: "Analyseer informatie: kernpunten, risico's en aanbevelingen", category: "analyse", usesPreviousAnswer: true },
  { name: "create", label: "Document maken", description: "Maak een nieuw document in de Schrijfstudio", category: "werk" },
  { name: "code", label: "Programmeertaak", description: "Start een AI Code-taak in het gekoppelde project", category: "werk" },
  { name: "browser", label: "Browsertaak", description: "Start een toegestane browsertaak", category: "werk" },
];

export interface ParsedCommand {
  name: SlashCommandName;
  /** Argument direct na de opdracht (alleen voor opdrachten met argHint), bijv. "engels". */
  arg: string | null;
  body: string;
}

const LANGUAGES: Record<string, string> = {
  engels: "Engels", english: "Engels", en: "Engels",
  duits: "Duits", german: "Duits", de: "Duits",
  frans: "Frans", french: "Frans", fr: "Frans",
  spaans: "Spaans", spanish: "Spaans", es: "Spaans",
  nederlands: "Nederlands", dutch: "Nederlands", nl: "Nederlands",
  pools: "Pools", polish: "Pools", pl: "Pools",
  turks: "Turks", turkish: "Turks", tr: "Turks",
  arabisch: "Arabisch", arabic: "Arabisch", ar: "Arabisch",
  italiaans: "Italiaans", italian: "Italiaans", it: "Italiaans",
  portugees: "Portugees", portuguese: "Portugees", pt: "Portugees",
};

export function normalizeLanguage(input: string | null | undefined): string | null {
  if (!input) return null;
  return LANGUAGES[input.trim().toLowerCase()] ?? null;
}

/** Herkent "/opdracht [argument] tekst". Geeft null terug als het geen geldige opdracht is. */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const m = input.trimStart().match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const name = m[1].toLowerCase() as SlashCommandName;
  const def = SLASH_COMMANDS.find((c) => c.name === name);
  if (!def) return null;
  let rest = (m[2] ?? "").trim();
  let arg: string | null = null;
  if (def.argHint) {
    const first = rest.split(/\s+/)[0] ?? "";
    if (name === "translate" ? normalizeLanguage(first) : first) {
      arg = first;
      rest = rest.slice(first.length).trim();
    }
  }
  return { name, arg, body: rest };
}

export function commandSuggestions(prefix: string): SlashCommandDef[] {
  const p = prefix.replace(/^\//, "").toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(p) || c.label.toLowerCase().includes(p));
}
