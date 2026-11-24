"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { api, ClientApiError } from "@/lib/client/api";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ slug: string }>("/api/workspaces", { name });
      router.push(`/w/${res.slug}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Aanmaken mislukt");
      setLoading(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam van de organisatie" required minLength={2} className="bg-white/5 border-white/12 text-white" />
      <Button type="submit" variant="accent" loading={loading}>Aanmaken</Button>
      {error && <p className="text-sm text-[#f7b3ad]">{error}</p>}
    </form>
  );
}
