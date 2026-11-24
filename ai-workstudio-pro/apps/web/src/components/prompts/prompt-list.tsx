"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { api, ClientApiError } from "@/lib/client/api";
import { timeAgo } from "@/lib/utils";

interface PromptRow { id: string; name: string; description: string; tags: string[]; current_version: number; versions: number; updated_at: string }

export function PromptList({ slug, prompts, canManage }: { slug: string; prompts: PromptRow[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", tags: "" });
  const [loading, setLoading] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/prompts`, {
        name: form.name,
        description: form.description,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      router.push(`/w/${slug}/prompts/${r.id}`);
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Aanmaken mislukt");
      setLoading(false);
    }
  }
  const createButton = canManage && (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus /> Nieuwe prompt</Button>
      </DialogTrigger>
      <DialogContent title="Nieuwe prompt" description="Je kunt rol, context, doel, variabelen en uitvoerformaat daarna visueel instellen.">
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Naam" htmlFor="pname"><Input id="pname" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bijv. Offerte-samenvatting" /></Field>
          <Field label="Omschrijving"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Labels" hint="Komma-gescheiden"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="sales, offerte" /></Field>
          <Button type="submit" loading={loading}>Aanmaken</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{createButton}</div>
      {prompts.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="Nog geen prompts" description="Maak herbruikbare prompt-templates met variabelen, versiebeheer en tests." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {prompts.map((p) => (
            <Link key={p.id} href={`/w/${slug}/prompts/${p.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-brand-sky/50">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  <Badge tone="info">v{p.current_version}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description || "Geen omschrijving"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                  <span className="ml-auto text-xs text-muted-foreground">{p.versions} versie{p.versions === 1 ? "" : "s"} · {timeAgo(p.updated_at)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
