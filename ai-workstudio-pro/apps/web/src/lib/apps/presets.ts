export interface InputField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "email";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface AppConfig {
  provider: string;
  modelId: string;
  promptId: string | null;
  systemPrompt: string;
  userTemplate: string;
  inputFields: InputField[];
  knowledgeBaseIds: string[];
  toolKeys: string[];
  output: { format: "text" | "markdown" | "json_schema"; schema?: Record<string, unknown> | null };
}

export type AppType = "chatbot" | "customer_service" | "email_assistant" | "document_analysis" | "quote_generator" | "data_assistant" | "internal_assistant" | "custom";

export const APP_TYPES: Record<AppType, { label: string; description: string; preset: Omit<AppConfig, "provider" | "modelId" | "promptId" | "knowledgeBaseIds"> }> = {
  chatbot: {
    label: "AI-chatbot",
    description: "Algemene vraag-en-antwoord-assistent.",
    preset: {
      systemPrompt: "Je bent een vriendelijke, behulpzame assistent. Antwoord in het Nederlands, duidelijk en beknopt.",
      userTemplate: "{{vraag}}",
      inputFields: [{ name: "vraag", label: "Vraag", type: "textarea", required: true }],
      toolKeys: [],
      output: { format: "markdown" },
    },
  },
  customer_service: {
    label: "AI-klantenservice",
    description: "Beantwoordt klantvragen op basis van de kennisbank, met bronnen.",
    preset: {
      systemPrompt: "Je bent een klantenservicemedewerker. Beantwoord vragen uitsluitend op basis van de kennisbank, vriendelijk en zakelijk. Doe geen toezeggingen die niet in de bronnen staan.",
      userTemplate: "Klantvraag van {{naam}}:\n{{vraag}}",
      inputFields: [{ name: "naam", label: "Naam klant", type: "text" }, { name: "vraag", label: "Klantvraag", type: "textarea", required: true }],
      toolKeys: ["knowledge_search"],
      output: { format: "markdown" },
    },
  },
  email_assistant: {
    label: "AI-e-mailassistent",
    description: "Schrijft professionele e-mails en slaat ze op als concept.",
    preset: {
      systemPrompt: "Je schrijft professionele, klantvriendelijke zakelijke e-mails in het Nederlands. Sla de e-mail op als concept met de tool email_draft.",
      userTemplate: "Schrijf een e-mail aan {{ontvanger}} ({{email}}) over: {{onderwerp}}\nToon: {{toon}}\nKernpunten:\n{{kernpunten}}",
      inputFields: [
        { name: "ontvanger", label: "Ontvanger", type: "text", required: true },
        { name: "email", label: "E-mailadres", type: "email", required: true },
        { name: "onderwerp", label: "Onderwerp", type: "text", required: true },
        { name: "toon", label: "Toon", type: "select", options: ["formeel", "vriendelijk-zakelijk", "kort en bondig"] },
        { name: "kernpunten", label: "Kernpunten", type: "textarea" },
      ],
      toolKeys: ["email_draft"],
      output: { format: "markdown" },
    },
  },
  document_analysis: {
    label: "AI-documentanalyse",
    description: "Analyseert tekst of documenten en geeft een gestructureerde samenvatting.",
    preset: {
      systemPrompt: "Je bent een nauwkeurige analist. Analyseer de aangeleverde tekst en baseer je uitsluitend op de inhoud ervan.",
      userTemplate: "Analyseer het volgende document ({{type}}):\n\n{{tekst}}",
      inputFields: [
        { name: "type", label: "Soort document", type: "select", options: ["contract", "aanbesteding", "offerte", "beleid", "overig"] },
        { name: "tekst", label: "Tekst", type: "textarea", required: true },
      ],
      toolKeys: [],
      output: {
        format: "json_schema",
        schema: {
          type: "object",
          properties: {
            samenvatting: { type: "string" },
            belangrijkste_punten: { type: "array", items: { type: "string" } },
            risicos: { type: "array", items: { type: "string" } },
            deadlines: { type: "array", items: { type: "string" } },
          },
          required: ["samenvatting", "belangrijkste_punten", "risicos", "deadlines"],
        },
      },
    },
  },
  quote_generator: {
    label: "AI-offertegenerator",
    description: "Stelt offerteconcepten op met exacte berekeningen.",
    preset: {
      systemPrompt: "Je bent een offertespecialist voor schoonmaakdiensten. Gebruik alleen tarieven uit de kennisbank (anders '[tarief in te vullen]'), reken met de rekenmachine en vermeld bedragen excl. en incl. 21% btw.",
      userTemplate: "Offerte voor {{klant}}\nObject: {{object}} ({{m2}} m²)\nFrequentie: {{frequentie}}\nWensen: {{wensen}}",
      inputFields: [
        { name: "klant", label: "Klant", type: "text", required: true },
        { name: "object", label: "Type object", type: "select", options: ["kantoor", "praktijk", "school", "winkel", "VvE", "overig"] },
        { name: "m2", label: "Oppervlakte (m²)", type: "number", required: true },
        { name: "frequentie", label: "Frequentie", type: "text", placeholder: "bijv. 2x per week" },
        { name: "wensen", label: "Bijzondere wensen", type: "textarea" },
      ],
      toolKeys: ["knowledge_search", "calculator"],
      output: { format: "markdown" },
    },
  },
  data_assistant: {
    label: "AI-data-assistent",
    description: "Beantwoordt vragen over interne bedrijfsgegevens.",
    preset: {
      systemPrompt: "Je bent een data-assistent. Zoek gegevens op met records_search en reken met de rekenmachine. Noem nooit cijfers die je niet hebt opgezocht.",
      userTemplate: "{{vraag}}",
      inputFields: [{ name: "vraag", label: "Vraag over de bedrijfsgegevens", type: "textarea", required: true }],
      toolKeys: ["records_search", "calculator"],
      output: { format: "markdown" },
    },
  },
  internal_assistant: {
    label: "Interne bedrijfsassistent",
    description: "Helpt medewerkers met procedures, beleid en werkinstructies.",
    preset: {
      systemPrompt: "Je bent de interne assistent voor medewerkers. Beantwoord vragen over procedures en beleid uitsluitend op basis van de kennisbank, met bronverwijzingen.",
      userTemplate: "{{vraag}}",
      inputFields: [{ name: "vraag", label: "Vraag", type: "textarea", required: true }],
      toolKeys: ["knowledge_search", "current_datetime"],
      output: { format: "markdown" },
    },
  },
  custom: {
    label: "Eigen app",
    description: "Start leeg en configureer alles zelf.",
    preset: { systemPrompt: "", userTemplate: "{{invoer}}", inputFields: [{ name: "invoer", label: "Invoer", type: "textarea", required: true }], toolKeys: [], output: { format: "text" } },
  },
};
