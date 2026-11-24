"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api, ClientApiError } from "@/lib/client/api";
import { timeAgo } from "@/lib/utils";

interface Row { id: string; name: string; description: string; status: string; version: number; nodes: number; runs: number; updated_at: string }

export function WorkflowList({ slug, workflows, canManage }: { slug: string; workflows: Row[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ id: string }>(`/api/w/${slug}/workflows`, { name, description });
      router.push(`/w/${slug}/workflows/${r.id}`);
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Aanmaken mislukt");
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {canManage && <div><Button variant="accent" onClick={() => setOpen(true)}><Plus /> Nieuwe workflow</Button></div>}
      {workflows.length === 0 ? <EmptyState icon={<Workflow />} title="Nog geen workflows" description="Bouw visuele workflows met agents, controles, goedkeuringen en uitvoer." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((w) => (
            <Link key={w.id} href={`/w/${slug}/workflows/${w.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-brand-sky/50">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{w.name}</p><StatusBadge status={w.status} /></div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.description || "Geen omschrijving"}</p>
                <p className="mt-3 text-xs text-muted-foreground">{w.nodes} nodes · {w.runs} uitvoeringen · v{w.version} · {timeAgo(w.updated_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nieuwe workflow">
          <form onSubmit={create} className="flex flex-col gap-3">
            <Field label="Naam"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Omschrijving"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Button type="submit">Aanmaken</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
