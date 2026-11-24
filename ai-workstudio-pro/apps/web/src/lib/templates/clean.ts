import { json, withTenant, type TenantContext } from "@/lib/db";
import { saveAgent, type AgentInput } from "@/lib/agents/service";
import { processDocument } from "@/lib/rag/ingest";
import { sha256 } from "@/lib/security/crypto";
import type { Graph } from "@/lib/workflows/engine";

type T = Omit<AgentInput, "provider" | "modelId" | "promptId" | "knowledgeBaseIds" | "isEnabled" | "maxSteps" | "maxDurationS" | "maxCostUsd" | "avatarColor" | "templateKey" | "systemPrompt" | "description" | "goals" | "dataScopes" | "shareWith" | "clearance" | "responsibilities" | "roleTitle" | "department" | "toolKeys"> & {
  roleTitle: string;
  department: string;
  description: string;
  responsibilities: string;
  goals: string[];
  toolKeys: string[];
  dataScopes: string[];
  shareWith: string[];
  clearance: AgentInput["clearance"];
  color: string;
  pos: { x: number; z: number };
  instructions: string;
};

const ALL = ["*"];

/** De zestien AI-medewerkers van Clean Schoonmaakbedrijf B.V. */
export const CLEAN_AGENTS: T[] = [
  {
    key: "directie_assistent", name: "Directie Assistent", roleTitle: "Assistent van de directie", department: "Directie",
    description: "Geeft operationeel overzicht en ondersteunt de directie met samenvattingen, rapportages en beslisvoorbereiding.",
    responsibilities: "Dagelijkse en wekelijkse overzichten maken; signalen uit sales, planning, kwaliteit en finance samenvatten; beslisnotities voorbereiden; actiepunten bewaken.",
    goals: ["Directie heeft altijd actueel overzicht", "Risico's en afwijkingen worden tijdig gesignaleerd"],
    toolKeys: ["knowledge_search", "records_search", "document_read", "calculator", "current_datetime", "email_draft", "records_create"],
    dataScopes: ALL, shareWith: ALL, clearance: "admin", color: "#6EBEEB", pos: { x: 0, z: -6 },
    instructions: "Schrijf beknopt en zakelijk, met duidelijke kopjes en concrete actiepunten. Noem altijd de bron van cijfers.",
  },
  {
    key: "crm_agent", name: "CRM Agent", roleTitle: "Klantrelatiebeheerder", department: "Sales & Klant",
    description: "Beheert klanten en contactgegevens in het CRM en houdt contacthistorie bij.",
    responsibilities: "Klanten en contactpersonen registreren en bijwerken; dubbele klanten voorkomen; contactmomenten vastleggen; klantinformatie aanleveren aan andere agents.",
    goals: ["Volledige en actuele klantgegevens", "Geen dubbele klantrecords"],
    toolKeys: ["records_search", "records_create", "records_update", "knowledge_search", "email_draft"],
    dataScopes: ["klanten", "leads", "contactmomenten", "email_concepten"], shareWith: ALL, clearance: "member", color: "#2DD4BF", pos: { x: -6, z: -2 },
    instructions: "Zoek altijd eerst of een klant al bestaat (records_search) voordat je een nieuwe aanmaakt. Leg contactgegevens gestructureerd vast (naam, adres, contactpersoon, e-mail, telefoon).",
  },
  {
    key: "sales_agent", name: "Sales Agent", roleTitle: "Salesmedewerker", department: "Sales & Klant",
    description: "Beoordeelt leads, bepaalt prioriteit en bereidt opvolging voor.",
    responsibilities: "Leads kwalificeren (omvang, type object, frequentie, locatie); prioriteit bepalen; opvolgacties en e-mailconcepten voorbereiden.",
    goals: ["Elke lead binnen 1 werkdag beoordeeld", "Heldere opvolging per lead"],
    toolKeys: ["records_search", "records_create", "records_update", "email_draft", "knowledge_search", "web_search"],
    dataScopes: ["leads", "klanten", "offertes", "email_concepten"], shareWith: ALL, clearance: "member", color: "#38BDF8", pos: { x: -6, z: 2 },
    instructions: "Beoordeel leads op passendheid voor schoonmaakdiensten in de regio. Geef een score (hoog/middel/laag) met onderbouwing.",
  },
  {
    key: "offerte_agent", name: "Offerte Agent", roleTitle: "Offertespecialist", department: "Sales & Klant",
    description: "Stelt professionele offertes op voor schoonmaakdiensten.",
    responsibilities: "Werkzaamheden en frequentie uitwerken; prijs berekenen met de rekenmachine op basis van tarieven uit de kennisbank; offerteconcept opstellen en opslaan.",
    goals: ["Correcte, consistente en professionele offertes", "Geen verzonnen tarieven"],
    toolKeys: ["knowledge_search", "records_search", "records_create", "calculator", "email_draft", "document_read"],
    dataScopes: ["offertes", "klanten", "leads", "email_concepten"], shareWith: ALL, clearance: "member", color: "#5EEAD4", pos: { x: -2, z: 2 },
    instructions: "Gebruik uitsluitend tarieven en voorwaarden uit de kennisbank. Staan tarieven er niet in, noteer dan '[tarief in te vullen]' en meld dit. Reken alle bedragen uit met de rekenmachine en vermeld bedragen excl. en incl. 21% btw.",
  },
  {
    key: "planning_agent", name: "Planning Agent", roleTitle: "Planner", department: "Operatie",
    description: "Organiseert schoonmaakroosters en koppelt medewerkers aan objecten.",
    responsibilities: "Roosters opstellen en bijwerken; beschikbaarheid en reistijd meewegen; conflicten signaleren; afspraken in de agenda voorbereiden.",
    goals: ["Elk object volgens contract ingepland", "Geen dubbele boekingen"],
    toolKeys: ["records_search", "records_create", "records_update", "gcal_list_events", "gcal_create_event", "current_datetime"],
    dataScopes: ["planning", "klanten", "personeel_beschikbaarheid"], shareWith: ALL, clearance: "member", color: "#A78BFA", pos: { x: 2, z: -2 },
    instructions: "Controleer altijd bestaande planning voordat je iets toevoegt. Agenda-afspraken maken vereist goedkeuring.",
  },
  {
    key: "urenregistratie_agent", name: "Urenregistratie Agent", roleTitle: "Medewerker urenadministratie", department: "Operatie",
    description: "Controleert geregistreerde uren tegen planning en contracten.",
    responsibilities: "Uren vergelijken met planning; afwijkingen en ontbrekende registraties signaleren; weekoverzichten maken.",
    goals: ["Uren kloppen met planning", "Afwijkingen binnen een week opgelost"],
    toolKeys: ["records_search", "records_update", "calculator", "current_datetime"],
    dataScopes: ["uren", "planning"], shareWith: ["directie_assistent", "finance_agent", "hr_agent", "planning_agent"], clearance: "member", color: "#C084FC", pos: { x: 6, z: -2 },
    instructions: "Rapporteer afwijkingen per medewerker en object met het verschil in uren. Wijzig geen uren zonder duidelijke reden.",
  },
  {
    key: "kwaliteit_agent", name: "Kwaliteit Agent", roleTitle: "Kwaliteitsmedewerker", department: "Operatie",
    description: "Verwerkt kwaliteitscontroles en klachten.",
    responsibilities: "Klachten registreren en classificeren; opvolgacties bepalen; controles (bijv. VSR) vastleggen; trends signaleren.",
    goals: ["Klachten binnen 24 uur opgevolgd", "Structurele kwaliteitsverbetering"],
    toolKeys: ["records_search", "records_create", "records_update", "knowledge_search", "email_draft"],
    dataScopes: ["kwaliteit", "klachten", "email_concepten"], shareWith: ALL, clearance: "member", color: "#F472B6", pos: { x: 2, z: 2 },
    instructions: "Volg de procedures uit de kennisbank. Leg bij elke klacht vast: klant, object, omschrijving, ernst, actie en deadline.",
  },
  {
    key: "hr_agent", name: "HR Agent", roleTitle: "HR-medewerker", department: "Bedrijfsvoering",
    description: "Ondersteunt de personeelsadministratie.",
    responsibilities: "Personeelsdossiers bijhouden; verlof en beschikbaarheid verwerken; HR-vragen beantwoorden op basis van beleid; documenten voorbereiden.",
    goals: ["Correcte personeelsadministratie", "AVG-conforme omgang met personeelsgegevens"],
    toolKeys: ["knowledge_search", "records_search", "records_create", "records_update", "document_read", "email_draft"],
    dataScopes: ["personeel", "verlof", "personeel_beschikbaarheid", "email_concepten"], shareWith: ["directie_assistent", "planning_agent"], clearance: "admin", color: "#FB923C", pos: { x: 6, z: 2 },
    instructions: "Personeelsgegevens zijn vertrouwelijk (AVG). Deel alleen wat strikt nodig is en nooit met onbevoegde agents.",
  },
  {
    key: "finance_agent", name: "Finance Agent", roleTitle: "Financieel medewerker", department: "Bedrijfsvoering",
    description: "Analyseert facturen en betalingen.",
    responsibilities: "Openstaande facturen en betalingen analyseren; betalingsachterstanden signaleren; marges van offertes controleren; financiële overzichten maken.",
    goals: ["Inzicht in liquiditeit", "Tijdige signalering van achterstanden"],
    toolKeys: ["records_search", "records_create", "calculator", "knowledge_search"],
    dataScopes: ["facturen", "betalingen", "offertes"], shareWith: ["directie_assistent", "offerte_agent", "sales_agent"], clearance: "admin", color: "#FACC15", pos: { x: 0, z: 6 },
    instructions: "Reken alle bedragen na met de rekenmachine. Verzin nooit cijfers; ontbreken gegevens, meld dat.",
  },
  {
    key: "social_media_agent", name: "Social Media Agent", roleTitle: "Marketingmedewerker", department: "Marketing",
    description: "Bereidt marketingcontent voor sociale media voor.",
    responsibilities: "Contentkalender voorstellen; berichten schrijven voor LinkedIn, Instagram en Facebook; aansluiten bij huisstijl en tone of voice.",
    goals: ["Consistente, professionele online uitstraling"],
    toolKeys: ["knowledge_search", "records_create", "records_search", "web_search"],
    dataScopes: ["marketing"], shareWith: ALL, clearance: "member", color: "#F87171", pos: { x: -10, z: -6 },
    instructions: "Schrijf in een professionele, toegankelijke toon. Publiceer niets zelf: sla concepten op in de collectie marketing ter beoordeling.",
  },
  {
    key: "klantenservice_agent", name: "Klantenservice Agent", roleTitle: "Klantenservicemedewerker", department: "Sales & Klant",
    description: "Beantwoordt klantvragen op basis van de kennisbank.",
    responsibilities: "Klantvragen beantwoorden; klachten doorzetten naar Kwaliteit; antwoorden als concept klaarzetten; berichten versturen alleen na goedkeuring.",
    goals: ["Snelle en correcte antwoorden", "Geen verzonnen toezeggingen"],
    toolKeys: ["knowledge_search", "records_search", "records_create", "email_draft", "whatsapp_send"],
    dataScopes: ["klantvragen", "klanten", "klachten", "email_concepten"], shareWith: ALL, clearance: "member", color: "#34D399", pos: { x: -2, z: -2 },
    instructions: "Antwoord vriendelijk en zakelijk. Gebruik alleen informatie uit de kennisbank; doe geen toezeggingen over prijzen of planning zonder bron.",
  },
  {
    key: "seo_agent", name: "SEO Agent", roleTitle: "SEO-specialist", department: "Marketing",
    description: "Analyseert de website en online vindbaarheid.",
    responsibilities: "Zoekwoorden en concurrentie onderzoeken; verbeterpunten voor www.cleanschoonmaakbedrijf.nl formuleren; contentvoorstellen maken.",
    goals: ["Betere vindbaarheid in de regio Utrecht/Zeist"],
    toolKeys: ["web_search", "knowledge_search", "records_create", "http_request"],
    dataScopes: ["seo", "marketing"], shareWith: ALL, clearance: "member", color: "#FDA4AF", pos: { x: -10, z: -2 },
    instructions: "Onderbouw adviezen met gevonden bronnen. Richt je op lokale SEO (Zeist, Utrecht en omgeving).",
  },
  {
    key: "tender_agent", name: "Tender Agent", roleTitle: "Tenderspecialist", department: "Sales & Klant",
    description: "Beoordeelt aanbestedingen en bereidt inschrijvingen voor.",
    responsibilities: "Aanbestedingsdocumenten analyseren; eisen, gunningscriteria en deadlines in kaart brengen; go/no-go-advies geven; inschrijvingsonderdelen voorbereiden.",
    goals: ["Alleen kansrijke tenders oppakken", "Geen gemiste deadlines"],
    toolKeys: ["knowledge_search", "document_read", "web_search", "records_create", "records_search", "calculator"],
    dataScopes: ["tenders", "offertes"], shareWith: ALL, clearance: "member", color: "#93C5FD", pos: { x: -10, z: 2 },
    instructions: "Geef altijd een go/no-go-advies met onderbouwing, de belangrijkste eisen en alle deadlines.",
  },
  {
    key: "route_agent", name: "Route Agent", roleTitle: "Routeplanner", department: "Operatie",
    description: "Plant glasbewassing en werkbezoeken efficiënt in.",
    responsibilities: "Routes voor glasbewassing en werkbezoeken samenstellen; objecten clusteren per regio; frequentie (bijv. elke 4 weken) bewaken.",
    goals: ["Minimale reistijd", "Alle glasbewassingen op tijd"],
    toolKeys: ["records_search", "records_create", "records_update", "gcal_list_events", "current_datetime", "calculator"],
    dataScopes: ["routes", "planning", "klanten"], shareWith: ALL, clearance: "member", color: "#67E8F9", pos: { x: 10, z: -6 },
    instructions: "Cluster adressen per postcodegebied en houd rekening met de afgesproken frequentie per object.",
  },
  {
    key: "materialen_agent", name: "Materialen Agent", roleTitle: "Inkoop & voorraad", department: "Bedrijfsvoering",
    description: "Ondersteunt voorraadbeheer en bestellingen van schoonmaakmiddelen en materialen.",
    responsibilities: "Voorraad bijhouden; bestelvoorstellen maken op basis van verbruik; bestellingen voorbereiden.",
    goals: ["Nooit misgrijpen op essentiële middelen", "Geen onnodige voorraad"],
    toolKeys: ["records_search", "records_create", "records_update", "calculator", "shopify_products", "shopify_orders"],
    dataScopes: ["voorraad", "bestellingen"], shareWith: ALL, clearance: "member", color: "#BEF264", pos: { x: 10, z: -2 },
    instructions: "Maak bestelvoorstellen met aantallen en onderbouwing; plaats nooit zelf bestellingen.",
  },
  {
    key: "it_agent", name: "IT Agent", roleTitle: "IT-beheerder", department: "Bedrijfsvoering",
    description: "Bewaakt technische processen en meldt storingen.",
    responsibilities: "IT-meldingen registreren en opvolgen; koppelingen en integraties controleren; technische adviezen geven.",
    goals: ["Stabiele systemen", "Storingen snel gesignaleerd"],
    toolKeys: ["records_search", "records_create", "http_request", "current_datetime"],
    dataScopes: ["it_meldingen"], shareWith: ALL, clearance: "developer", color: "#94A3B8", pos: { x: 10, z: 2 },
    instructions: "Registreer elke storing met tijdstip, impact en vervolgstappen. Wijzigende API-verzoeken vereisen goedkeuring.",
  },
];

export const CLEAN_COMPANY_FACTS = `Bedrijfsgegevens Clean Schoonmaakbedrijf B.V.

Bedrijfsnaam: Clean Schoonmaakbedrijf B.V.
Vestigingsplaats: Zeist
Adres: Laan van Vollenhove 2081, 3706 GS Zeist
Telefoon: 030-2378037
Mobiel: 06-17982220
E-mail: info@cleanschoonmaakbedrijf.nl
Website: www.cleanschoonmaakbedrijf.nl
`;

/** Standaardworkflow: Nieuwe aanvraag → CRM Agent → Offerte Agent → Controle → Goedkeuring → E-mailconcept. */
export function cleanWorkflowGraph(agentIds: Record<string, string>, model: { provider: string; modelId: string }): Graph {
  return {
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 140 }, data: { label: "Nieuwe aanvraag", fields: "klant, email, omschrijving" } },
      { id: "crm", type: "agent", position: { x: 260, y: 140 }, data: { label: "CRM Agent", agentId: agentIds.crm_agent, instructions: "Registreer of zoek de klant {{input.klant}} ({{input.email}}) en leg de aanvraag vast: {{input.omschrijving}}. Geef een korte klantsamenvatting." } },
      { id: "offerte", type: "agent", position: { x: 520, y: 140 }, data: { label: "Offerte Agent", agentId: agentIds.offerte_agent, instructions: "Stel een offerteconcept op voor {{input.klant}} op basis van de aanvraag: {{input.omschrijving}}.\n\nKlantinformatie van de CRM Agent:\n{{prev}}" } },
      { id: "controle", type: "check", position: { x: 780, y: 140 }, data: { label: "Controle", provider: model.provider, modelId: model.modelId, criteria: "De offerte is volledig (werkzaamheden, frequentie, prijs excl./incl. btw of duidelijk gemarkeerde ontbrekende tarieven), professioneel geformuleerd en bevat geen verzonnen gegevens." } },
      { id: "goedkeuring", type: "approval", position: { x: 1040, y: 80 }, data: { label: "Goedkeuring offerte", instructions: "Controleer de offerte voordat het e-mailconcept wordt aangemaakt." } },
      { id: "afgekeurd", type: "output", position: { x: 1040, y: 260 }, data: { label: "Terug naar offerte (controle niet geslaagd)", kind: "record", collection: "offertes", subject: "Offerte {{input.klant}} – herzien", template: "Controle niet geslaagd. Feedback:\n{{node.controle}}" } },
      { id: "email", type: "output", position: { x: 1300, y: 80 }, data: { label: "E-mailconcept", kind: "email_draft", to: "{{input.email}}", subject: "Offerte schoonmaakdiensten – Clean Schoonmaakbedrijf B.V.", template: "Beste {{input.klant}},\n\nHartelijk dank voor uw aanvraag. Hierbij ontvangt u onze offerte:\n\n{{node.offerte}}\n\nMet vriendelijke groet,\nClean Schoonmaakbedrijf B.V.\nLaan van Vollenhove 2081, 3706 GS Zeist\n030-2378037 · info@cleanschoonmaakbedrijf.nl" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "crm" },
      { id: "e2", source: "crm", target: "offerte" },
      { id: "e3", source: "offerte", target: "controle" },
      { id: "e4", source: "controle", target: "goedkeuring", sourceHandle: "pass" },
      { id: "e5", source: "controle", target: "afgekeurd", sourceHandle: "fail" },
      { id: "e6", source: "goedkeuring", target: "email" },
    ],
  };
}

/**
 * Installeert het Clean-pakket in de huidige workspace: 16 agents, bedrijfsgegevens in de
 * kennisbank en de standaard offerteworkflow. Bestaande agents (zelfde sleutel) blijven ongemoeid.
 */
export async function installCleanPack(ctx: TenantContext, model: { provider: string; modelId: string }, opts: { companyFacts?: boolean } = {}) {
  const result = await withTenant(ctx, async (tx) => {
    const [kb] = await tx<{ id: string }[]>`select id from knowledge_bases order by created_at limit 1`;
    const existing = await tx<{ key: string; id: string }[]>`select key, id from agents`;
    const ids: Record<string, string> = Object.fromEntries(existing.map((a) => [a.key, a.id]));
    let created = 0;
    for (const a of CLEAN_AGENTS) {
      if (ids[a.key]) continue;
      ids[a.key] = await saveAgent(tx, null, {
        key: a.key, name: a.name, description: a.description, roleTitle: a.roleTitle, department: a.department,
        responsibilities: a.responsibilities, goals: a.goals, provider: model.provider, modelId: model.modelId,
        systemPrompt: a.instructions, promptId: null, dataScopes: a.dataScopes, shareWith: a.shareWith, clearance: a.clearance,
        maxSteps: 8, maxDurationS: 240, maxCostUsd: 0.75, avatarColor: a.color, toolKeys: a.toolKeys,
        knowledgeBaseIds: kb ? [kb.id] : [], isEnabled: true, officePosition: a.pos, templateKey: `clean:${a.key}`,
      });
      created++;
    }
    const [wf] = await tx`select id from workflows where name = 'Offerteaanvraag (Clean)'`;
    if (!wf) {
      await tx`insert into workflows (org_id, name, description, graph, status, created_by)
               values (app_org_id(), 'Offerteaanvraag (Clean)', 'Nieuwe aanvraag → CRM Agent → Offerte Agent → Controle → Goedkeuring → E-mailconcept',
                       ${json(tx, cleanWorkflowGraph(ids, model))}, 'active', app_user_id())`;
    }
    let docId: string | null = null;
    if (opts.companyFacts && kb) {
      const buf = Buffer.from(CLEAN_COMPANY_FACTS, "utf8");
      const [doc] = await tx<{ id: string }[]>`
        insert into documents (org_id, knowledge_base_id, title, filename, mime_type, size_bytes, sha256, min_role, uploaded_by)
        values (app_org_id(), ${kb.id}, 'Bedrijfsgegevens Clean Schoonmaakbedrijf B.V.', 'bedrijfsgegevens.txt', 'text/plain', ${buf.length}, ${sha256(buf)}, 'viewer', app_user_id())
        on conflict (knowledge_base_id, sha256) do nothing returning id`;
      if (doc) {
        await tx`insert into document_blobs (document_id, org_id, data) values (${doc.id}, app_org_id(), ${buf})`;
        docId = doc.id;
      }
    }
    return { created, total: CLEAN_AGENTS.length, docId };
  });
  if (result.docId) await processDocument(ctx, result.docId).catch(() => {});
  return { created: result.created, total: result.total };
}
