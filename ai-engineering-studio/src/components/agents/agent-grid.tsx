"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { ModelSelect, defaultModel, parseModelValue } from "@/components/shared/model-select";
import { api, ClientApiError } from "@/lib/client/api";
import type { StudioOptions } from "@/lib/studio-options";

interface AgentRow { id: string; key: string; name: string; role_title: string; department: string; status: string; status_detail: string | null; model_id: string; provider: string; avatar_color: string; is_enabled: boolean; tools: number; runs: number }

export function AgentGrid({ slug, agents, options, canManage }: { slug: string; agents: AgentRow[]; options: StudioOptions; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(defaultModel(options.models));
  const [companyFacts, setCompanyFacts] = useState(false);
  const [loading, setLoading] = useState(false);
  const departments = [...new Set(agents.map((a) => a.department))];

  async function install() {
    setLoading(true);
    try {
      const r = await api.post<{ created: number }>(`/api/w/${slug}/templates`, { pack: "clean", ...parseModelValue(model), companyFacts });
      toast.success(`${r.created} AI-medewerkers geïnstalleerd`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Installeren mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="accent"><Link href={`/w/${slug}/agents/new`}><Plus /> Nieuwe agent</Link></Button>
          <Button variant="secondary" onClick={() => setOpen(true)}><PackagePlus /> Sjabloonpakket installeren</Button>
        </div>
      )}
      {agents.length === 0 ? (
        <EmptyState icon={<Bot />} title="Nog geen AI-agents" description="Maak een agent of installeer het pakket met zestien AI-medewerkers voor een schoonmaakbedrijf." />
      ) : (
        departments.map((dep) => (
          <section key={dep}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{dep}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {agents.filter((a) => a.department === dep).map((a) => (
                <Link key={a.id} href={`/w/${slug}/agents/${a.id}`} className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand-sky/50" data-testid="agent-card">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-navy-950 shadow-[0_0_18px_-4px_var(--glow)]" style={{ background: a.avatar_color }}>
                      <Bot className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.role_title}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={a.is_enabled ? a.status : "disabled"} />
                    {a.provider === "demo" && <Badge tone="demo">demo</Badge>}
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{a.status_detail ?? `${a.tools} tools · ${a.runs} runs · ${a.model_id}`}</p>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Sjabloonpakket: schoonmaakbedrijf" description="Installeert 16 AI-medewerkers (Directie, CRM, Sales, Offerte, Planning, Uren, Kwaliteit, HR, Finance, Social Media, Klantenservice, SEO, Tender, Route, Materialen, IT) met rechten, tools en de offerteworkflow.">
          <div className="flex flex-col gap-4">
            <Field label="Model voor alle agents (later per agent aan te passen)"><ModelSelect models={options.models} value={model} onChange={setModel} /></Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[#14b8a6]" checked={companyFacts} onChange={(e) => setCompanyFacts(e.target.checked)} />
              Bedrijfsgegevens van Clean Schoonmaakbedrijf B.V. (adres, telefoon, e-mail, website) toevoegen aan de kennisbank
            </label>
            <Button variant="accent" onClick={install} loading={loading} disabled={!model}>Installeren</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
