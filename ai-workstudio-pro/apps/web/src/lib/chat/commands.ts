import { normalizeLanguage, SLASH_COMMANDS, type ChatArtifact, type DocumentKind, type ParsedCommand } from "@workstudio/shared";
import { json, withTenant } from "@/lib/db";
import type { OrgContext } from "@/lib/auth/context";
import { ApiError, ConfigurationError } from "@/lib/api/errors";
import { runChat } from "@/lib/ai/service";
import { ProviderError } from "@/lib/ai/types";
import { UNTRUSTED_DATA_POLICY, wrapUntrusted } from "@/lib/security/injection";
import { parseEmail, saveDocument, writingContext } from "@/lib/writing/service";
import { startCodeTask } from "@/lib/code/runner";
import type { ChatEvent, DbMessage } from "@/lib/chat/engine";

const MSG_COLS = `id, role, content, tool_calls, tool_call_id, tool_name, is_error, citations, metadata, provider, model_id,
  input_tokens, output_tokens, cost_usd, created_at`;

/** Marker in de systeeminstructie: het antwoord moet beginnen met een onderwerpregel. */
export const EMAIL_FORMAT_INSTRUCTION = 'Begin je antwoord met precies één regel "Onderwerp: …", gevolgd door een lege regel en daarna de e-mailtekst (aanhef, kern, afsluiting met groet). Geen extra uitleg.';

interface WritingSpec {
  kind: DocumentKind;
  title: string;
  instruction: (arg: string | null) => string;
  /** Is de meegegeven tekst door de gebruiker geplakte inhoud (behandelen als data)? */
  untrustedInput: boolean;
  format?: "email";
}

const WRITING: Partial<Record<ParsedCommand["name"], WritingSpec>> = {
  email: {
    kind: "email", title: "E-mail", untrustedInput: false, format: "email",
    instruction: () => `Schrijf een zakelijke e-mail op basis van de opdracht van de gebruiker. ${EMAIL_FORMAT_INSTRUCTION}`,
  },
  reply: {
    kind: "reply", title: "Antwoord", untrustedInput: true, format: "email",
    instruction: () => `Schrijf een passend, behulpzaam antwoord op het ontvangen bericht hieronder. Beantwoord alle vragen, verzin geen feiten, afspraken of prijzen die niet in het bericht of de bedrijfsgegevens staan, en zet open punten tussen [vierkante haken]. ${EMAIL_FORMAT_INSTRUCTION}`,
  },
  rewrite: {
    kind: "document", title: "Herschreven tekst", untrustedInput: true,
    instruction: () => "Herschrijf de tekst hieronder: verbeter zinsbouw, duidelijkheid en toon. Behoud de inhoud, feiten en betekenis. Geef alleen de herschreven tekst terug.",
  },
  humanize: {
    kind: "document", title: "Natuurlijke tekst", untrustedInput: true,
    instruction: () => "Herschrijf de tekst hieronder zodat hij natuurlijk en menselijk klinkt: afwisselende zinslengte, concrete woorden, geen clichés, geen opsommingen tenzij nodig, geen overdreven enthousiasme en geen typische AI-formuleringen. Behoud inhoud en feiten. Geef alleen de tekst terug.",
  },
  translate: {
    kind: "translation", title: "Vertaling", untrustedInput: true,
    instruction: (arg) => `Vertaal de tekst hieronder naar het ${normalizeLanguage(arg) ?? "Engels"}. Behoud opmaak, namen en bedragen. Pas de toon aan aan de gebruikelijke zakelijke stijl in die taal. Geef alleen de vertaling terug.`,
  },
  summarize: {
    kind: "summary", title: "Samenvatting", untrustedInput: true,
    instruction: () => "Vat de tekst hieronder samen: eerst één zin met de kern, daarna de belangrijkste punten als korte opsomming, en tot slot eventuele acties of deadlines. Verzin niets.",
  },
  analyze: {
    kind: "analysis", title: "Analyse", untrustedInput: true,
    instruction: () => "Analyseer de informatie hieronder. Gebruik de kopjes: Kernpunten, Kansen, Risico's en aandachtspunten, Aanbevelingen (concreet en uitvoerbaar). Maak onderscheid tussen feiten uit de tekst en je eigen inschatting.",
  },
  create: {
    kind: "document", title: "Document", untrustedInput: false,
    instruction: () => "Maak het gevraagde document volledig en direct bruikbaar. Begin met een titel als Markdown-kop (# Titel), gebruik duidelijke kopjes en houd het professioneel. Zet ontbrekende gegevens tussen [vierkante haken].",
  },
};

export function commandLabel(name: ParsedCommand["name"]) {
  return SLASH_COMMANDS.find((c) => c.name === name)?.label ?? name;
}

interface ConvRow {
  id: string;
  title: string;
  provider: string;
  model_id: string;
  style_id: string | null;
  project_id: string | null;
}

async function insertMessage(ctx: OrgContext, convId: string, m: { role: "user" | "assistant"; content: string; title?: string; metadata: Record<string, unknown>; provider?: string; modelId?: string; usage?: { inputTokens: number; outputTokens: number }; costUsd?: number | null }) {
  return withTenant(ctx.tenant, async (tx) => {
    const [row] = await tx<DbMessage[]>`
      insert into messages (org_id, conversation_id, role, content, metadata, provider, model_id, input_tokens, output_tokens, cost_usd)
      values (app_org_id(), ${convId}, ${m.role}, ${m.content}, ${json(tx, m.metadata)}, ${m.provider ?? null}, ${m.modelId ?? null},
              ${m.usage?.inputTokens ?? 0}, ${m.usage?.outputTokens ?? 0}, ${m.costUsd ?? null})
      returning ${tx.unsafe(MSG_COLS)}`;
    await tx`update conversations set updated_at = now(),
               total_input_tokens = total_input_tokens + ${m.usage?.inputTokens ?? 0},
               total_output_tokens = total_output_tokens + ${m.usage?.outputTokens ?? 0},
               total_cost_usd = total_cost_usd + ${m.costUsd ?? 0},
               title = case when title = 'Nieuw gesprek' and ${m.role === "user"} then ${m.title ?? m.content.replace(/\s+/g, " ").trim().slice(0, 60)} else title end
             where id = ${convId}`;
    return row;
  });
}

/**
 * Voert een slash-opdracht uit. Elke opdracht heeft een eigen handler:
 * schrijfopdrachten draaien een gerichte LLM-aanroep met de schrijfstijl van de gebruiker,
 * /create slaat een document op, /code start een echte AI Code-taak, /browser meldt eerlijk
 * welke onderdelen nog ontbreken.
 */
export async function runChatCommand(opts: { ctx: OrgContext; conversationId: string; raw: string; command: ParsedCommand; emit: (e: ChatEvent) => Promise<void> | void; signal?: AbortSignal }) {
  const { ctx, command, emit } = opts;
  const { conv, previous } = await withTenant(ctx.tenant, async (tx) => {
    const [conv] = await tx<ConvRow[]>`select id, title, provider, model_id, style_id, project_id from conversations where id = ${opts.conversationId}`;
    if (!conv) throw new ApiError(404, "Gesprek niet gevonden");
    const [previous] = await tx<{ content: string }[]>`
      select content from messages where conversation_id = ${conv.id} and role = 'assistant' and content <> '' order by created_at desc limit 1`;
    return { conv, previous: previous?.content ?? null };
  });

  const title = `${commandLabel(command.name)}${command.body.trim() ? `: ${command.body.replace(/\s+/g, " ").trim()}` : ""}`.slice(0, 60);
  const userMsg = await insertMessage(ctx, conv.id, { role: "user", content: opts.raw, title, metadata: { command: command.name, arg: command.arg } });
  await emit({ type: "user_message", message: userMsg });

  const finishWith = async (content: string, artifact: ChatArtifact, extra: Record<string, unknown> = {}) => {
    const msg = await insertMessage(ctx, conv.id, { role: "assistant", content, metadata: { command: command.name, artifact, ...extra } });
    await emit({ type: "assistant_message", message: msg });
    await emit({ type: "done", inputTokens: 0, outputTokens: 0, costUsd: 0 });
  };

  // /browser – eerlijk: nog niet gebouwd.
  if (command.name === "browser") {
    return finishWith(
      "AI Browser is nog niet beschikbaar in deze versie. Er wordt niets in een browser uitgevoerd.",
      {
        type: "notice", title: "AI Browser nog niet geïnstalleerd",
        missing: [
          "Browserdienst met Playwright (packages/browser-automation, fase 6)",
          "Toestemmingsbeheer per website en bevestiging vóór formulieren of aankopen",
          "Chrome-extensie \"AI WorkStudio Assistant\" voor het huidige tabblad (fase 5)",
        ],
      },
    );
  }

  // /code – start een echte AI Code-taak in het gekoppelde project.
  if (command.name === "code") {
    if (!ctx.can("code.use")) {
      return finishWith("Je hebt geen recht om AI Code-taken te starten. Vraag een beheerder om de rol Developer of Admin.", { type: "notice", title: "Geen toegang tot AI Code", missing: ["Recht code.use (rol owner, admin of developer)"] });
    }
    if (!command.body.trim()) {
      return finishWith("Geef na /code een opdracht mee, bijvoorbeeld: /code voeg een korting van 10% toe en test het.", { type: "notice", title: "Opdracht ontbreekt", missing: ["Omschrijving van de programmeertaak"] });
    }
    if (!conv.project_id) {
      return finishWith("Dit gesprek is nog niet aan een project gekoppeld. Kies rechtsboven een project en herhaal de opdracht.", { type: "notice", title: "Geen project gekoppeld", missing: ["Project koppelen aan dit gesprek (projectkiezer rechtsboven)"] });
    }
    try {
      const taskId = await startCodeTask(ctx.tenant, { projectId: conv.project_id, prompt: command.body, conversationId: conv.id });
      const [p] = await withTenant(ctx.tenant, (tx) => tx<{ name: string }[]>`select name from code_projects where id = ${conv.project_id}`);
      return finishWith(`AI Code-taak gestart in project "${p?.name ?? "project"}". Je kunt de voortgang hieronder of in AI Code volgen.`, { type: "code_task", taskId, projectId: conv.project_id, projectName: p?.name ?? "project" });
    } catch (e) {
      if (e instanceof ApiError) {
        return finishWith(e.message, { type: "notice", title: "AI Code-taak niet gestart", missing: [e.message] });
      }
      throw e;
    }
  }

  const spec = WRITING[command.name];
  if (!spec) throw new ApiError(400, "Onbekende opdracht");
  if (!ctx.can("writing.use")) throw new ApiError(403, "Je hebt geen recht om de schrijfassistent te gebruiken");

  const def = SLASH_COMMANDS.find((c) => c.name === command.name);
  let input = command.body.trim();
  let fromPrevious = false;
  if (!input && def?.usesPreviousAnswer && previous) {
    input = previous;
    fromPrevious = true;
  }
  if (!input) {
    return finishWith(
      def?.usesPreviousAnswer
        ? `Geef tekst mee na /${command.name}, of gebruik de opdracht direct na een antwoord van de AI.`
        : `Geef na /${command.name} een omschrijving mee, bijvoorbeeld: /${command.name} ${command.name === "email" ? "aan een nieuwe klant over de offerte voor kantoorschoonmaak" : "…"}`,
      { type: "notice", title: "Tekst ontbreekt", missing: ["Tekst of omschrijving na de opdracht"] },
    );
  }

  const { system: styleSystem, style } = await withTenant(ctx.tenant, (tx) => writingContext(tx, conv.style_id));
  const system = [
    "Je bent de schrijfassistent van AI WorkStudio Pro. Je levert direct bruikbare teksten.",
    styleSystem,
    `## Opdracht: ${commandLabel(command.name)}\n${spec.instruction(command.arg)}`,
    spec.untrustedInput ? UNTRUSTED_DATA_POLICY : "",
  ].filter(Boolean).join("\n\n");
  const userContent = spec.untrustedInput
    ? `${fromPrevious ? "Gebruik het vorige antwoord als tekst." : "Tekst:"}\n${wrapUntrusted("TEKST VAN DE GEBRUIKER", input)}`
    : input;

  let result;
  try {
    result = await runChat({
      ctx: ctx.tenant, provider: conv.provider, modelId: conv.model_id, source: "chat", refType: "conversation", refId: conv.id,
      request: { system, messages: [{ role: "user", content: userContent }], maxTokens: 8000, effort: "medium", signal: opts.signal },
      onEvent: async (e) => {
        if (e.type === "text") await emit({ type: "text", delta: e.delta });
      },
    });
  } catch (err) {
    if (err instanceof ConfigurationError) return emit({ type: "error", error: err.message, setup: err.setup });
    if (err instanceof ProviderError || err instanceof ApiError) return emit({ type: "error", error: err.message });
    throw err;
  }

  let artifact: ChatArtifact;
  if (spec.format === "email") {
    const e = parseEmail(result.text);
    artifact = { type: "email", subject: e.subject, body: e.body };
  } else if (command.name === "create") {
    const title = (result.text.match(/^\s*#\s+(.+)$/m)?.[1] ?? input).replace(/[*_`]/g, "").trim().slice(0, 200) || "Nieuw document";
    const documentId = await saveDocument(ctx.tenant, {
      title, kind: "document", content: result.text, metadata: { command: "create", styleId: style?.id ?? null }, conversationId: conv.id, shared: false,
    });
    artifact = { type: "document", documentId, title };
  } else {
    artifact = { type: "text", title: spec.title, kind: spec.kind };
  }

  const msg = await insertMessage(ctx, conv.id, {
    role: "assistant", content: result.text, provider: result.provider, modelId: result.model, usage: result.usage, costUsd: result.costUsd,
    metadata: { command: command.name, artifact, styleId: style?.id ?? null, styleName: style?.name ?? null, fromPrevious, demo: result.provider === "demo", latencyMs: result.latencyMs },
  });
  await emit({ type: "assistant_message", message: msg });
  await emit({ type: "done", inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.costUsd });
}
