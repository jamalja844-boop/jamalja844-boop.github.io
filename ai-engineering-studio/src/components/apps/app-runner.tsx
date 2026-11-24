"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, JsonView } from "@/components/ui/misc";
import { Markdown } from "@/components/chat/markdown";
import { api, ClientApiError } from "@/lib/client/api";
import type { InputField } from "@/lib/apps/presets";
import { formatNumber, formatUsd } from "@/lib/utils";

interface RunResult {
  status: string; error: string | null; output: string; outputJson: unknown; citations: { n: number; title: string; page: number | null }[];
  tools: { tool: string; status: string }[]; inputTokens: number; outputTokens: number; costUsd: number | null; latencyMs: number; provider: string;
}

export function AppRunner({ slug, appId, fields }: { slug: string; appId: string; fields: InputField[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      setResult(await api.post<RunResult>(`/api/w/${slug}/apps/${appId}/run`, { input: values }));
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Uitvoeren mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={run} className="flex flex-col gap-3" data-testid="app-form">
        {fields.map((f) => (
          <Field key={f.name} label={`${f.label}${f.required ? " *" : ""}`}>
            {f.type === "textarea" ? (
              <Textarea rows={4} required={f.required} placeholder={f.placeholder} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            ) : f.type === "select" ? (
              <Select value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} required={f.required}>
                <option value="">Kies…</option>
                {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
              </Select>
            ) : (
              <Input type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "decimal" : undefined} required={f.required} placeholder={f.placeholder} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            )}
          </Field>
        ))}
        <Button type="submit" variant="accent" loading={loading}><Play /> Uitvoeren</Button>
      </form>
      <div className="min-w-0" data-testid="app-result">
        {!result ? (
          <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Het resultaat verschijnt hier.</div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.status === "succeeded" ? "success" : result.status === "waiting_approval" ? "warning" : "danger"}>{result.status === "succeeded" ? "geslaagd" : result.status === "waiting_approval" ? "wacht op goedkeuring" : "mislukt"}</Badge>
              {result.provider === "demo" && <Badge tone="demo">DEMO – geen echte AI</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">{formatNumber(result.latencyMs)} ms · {formatNumber(result.inputTokens + result.outputTokens)} tokens · {formatUsd(result.costUsd)}</span>
            </div>
            {result.error && <p className="text-sm text-danger">{result.error}</p>}
            {result.outputJson ? <JsonView value={result.outputJson} /> : result.output ? <Markdown text={result.output} /> : null}
            {result.tools.length > 0 && <p className="text-xs text-muted-foreground">Tools: {result.tools.map((t) => `${t.tool} (${t.status})`).join(", ")}</p>}
            {result.citations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.citations.map((c) => <span key={c.n} className="inline-flex items-center gap-1 rounded-lg border border-turq-400/30 px-2 py-0.5 text-xs"><BookOpen className="size-3" /> Bron {c.n}: {c.title}{c.page ? `, p. ${c.page}` : ""}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
