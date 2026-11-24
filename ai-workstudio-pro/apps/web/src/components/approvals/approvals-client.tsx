"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, EmptyState, JsonView, StatusBadge } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";
import { formatDate, timeAgo } from "@/lib/utils";

interface Approval {
  id: string; kind: string; title: string; summary: string; payload: Record<string, unknown>; risk_level: string; status: string;
  requester: string | null; agent_name: string | null; decided_by_name: string | null; decided_at: string | null; decision_note: string | null; created_at: string; expires_at: string;
}

function PendingCard({ slug, a, canDecide }: { slug: string; a: Approval; canDecide: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  async function decide(decision: "approve" | "reject") {
    setLoading(decision);
    try {
      const r = await api.post<{ execution: { status: string; error: string | null } | null }>(`/api/w/${slug}/approvals/${a.id}`, { decision, note: note || undefined });
      if (decision === "approve") {
        if (r.execution?.status === "succeeded" || !r.execution) toast.success("Goedgekeurd en uitgevoerd");
        else toast.warning(`Goedgekeurd, maar uitvoering mislukte: ${r.execution.error}`);
      } else toast.success("Afgewezen");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Mislukt");
    } finally {
      setLoading(null);
    }
  }
  return (
    <Card className="border-warning/40" data-testid="approval-request">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={a.risk_level === "sensitive" ? "danger" : "warning"}>{a.risk_level === "sensitive" ? "gevoelig" : a.risk_level}</Badge>
          <Badge>{a.kind === "tool_execution" ? "tooluitvoering" : a.kind === "workflow_step" ? "workflowstap" : a.kind}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{timeAgo(a.created_at)} · verloopt {formatDate(a.expires_at, false)}</span>
        </div>
        <CardTitle className="mt-1">{a.title}</CardTitle>
        <CardDescription>Aangevraagd door {a.agent_name ? `agent ${a.agent_name}` : a.requester ?? "onbekend"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <JsonView value={(a.payload.input as unknown) ?? a.payload} />
        {canDecide ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Toelichting (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="accent" loading={loading === "approve"} onClick={() => decide("approve")}><Check /> Goedkeuren</Button>
            <Button variant="danger" loading={loading === "reject"} onClick={() => decide("reject")}><X /> Afwijzen</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Alleen beheerders kunnen hierover beslissen.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ApprovalsClient({ slug, pending, history, canDecide }: { slug: string; pending: Approval[]; history: Approval[]; canDecide: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {pending.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Geen openstaande goedkeuringen" description="Gevoelige acties van agents, chats, apps en workflows verschijnen hier ter beoordeling." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{pending.map((a) => <PendingCard key={a.id} slug={slug} a={a} canDecide={canDecide} />)}</div>
      )}
      <Card>
        <CardHeader><CardTitle>Geschiedenis</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {history.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen besluiten.</p> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Verzoek</th><th className="pr-3">Status</th><th className="pr-3">Besloten door</th><th>Wanneer</th></tr></thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{a.title}{a.decision_note && <p className="text-xs text-muted-foreground">“{a.decision_note}”</p>}</td>
                    <td className="pr-3"><StatusBadge status={a.status} /></td>
                    <td className="pr-3">{a.decided_by_name ?? "–"}</td>
                    <td className="text-muted-foreground">{formatDate(a.decided_at ?? a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
