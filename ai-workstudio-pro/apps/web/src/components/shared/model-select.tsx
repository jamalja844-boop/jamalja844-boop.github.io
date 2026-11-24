"use client";

import { Select } from "@/components/ui/form";
import type { StudioOptions } from "@/lib/studio-options";

const LABEL: Record<string, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI", demo: "Demo-simulator (geen echte AI)" };

export function modelValue(provider: string, modelId: string) {
  return `${provider}::${modelId}`;
}

export function parseModelValue(v: string): { provider: string; modelId: string } {
  const [provider, ...rest] = v.split("::");
  return { provider, modelId: rest.join("::") };
}

/** Modelkeuze gegroepeerd per provider; modellen zonder ingestelde verbinding zijn uitgeschakeld. */
export function ModelSelect({ models, value, onChange, id, className }: { models: StudioOptions["models"]; value: string; onChange: (v: string) => void; id?: string; className?: string }) {
  const providers = [...new Set(models.map((m) => m.provider))];
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="AI-model">
      {!value && <option value="">Kies een model…</option>}
      {providers.map((p) => (
        <optgroup key={p} label={LABEL[p] ?? p}>
          {models.filter((m) => m.provider === p).map((m) => (
            <option key={m.id} value={modelValue(m.provider, m.model_id)} disabled={!m.available}>
              {m.display_name}{m.available ? "" : " — verbinding instellen"}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** Beste standaardkeuze: eerste beschikbare echte provider, anders demo. */
export function defaultModel(models: StudioOptions["models"]): string {
  const real = models.find((m) => m.available && m.provider !== "demo" && m.is_default) ?? models.find((m) => m.available && m.provider !== "demo");
  const any = real ?? models.find((m) => m.available);
  return any ? modelValue(any.provider, any.model_id) : "";
}
