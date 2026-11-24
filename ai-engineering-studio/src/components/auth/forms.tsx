"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ClientApiError } from "@/lib/client/api";

const darkField = "bg-white/5 border-white/12 text-white placeholder:text-navy-300";

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-[#f7b3ad]">{error}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ redirect: string }>("/api/auth/login", { email, password });
      const target = next && next.startsWith("/w/") ? next : res.redirect;
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Inloggen mislukt");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="E-mailadres" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={darkField} />
      </Field>
      <Field label="Wachtwoord" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={darkField} />
      </Field>
      <ErrorBox error={error} />
      <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-2">
        Inloggen
      </Button>
    </form>
  );
}

export function SetupForm({ firstUser }: { firstUser: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ redirect: string }>("/api/auth/setup", form);
      router.replace(res.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Registreren mislukt");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Je naam" htmlFor="name">
        <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} className={darkField} />
      </Field>
      <Field label="E-mailadres" htmlFor="email">
        <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} className={darkField} />
      </Field>
      <Field label="Wachtwoord" htmlFor="password" hint={<span className="text-navy-300">Minimaal 12 tekens, met letters en cijfers.</span>}>
        <Input id="password" type="password" required autoComplete="new-password" value={form.password} onChange={set("password")} className={darkField} />
      </Field>
      <Field label="Naam van je organisatie" htmlFor="orgName">
        <Input id="orgName" required value={form.orgName} onChange={set("orgName")} placeholder="Bijv. Clean Schoonmaakbedrijf B.V." className={darkField} />
      </Field>
      <ErrorBox error={error} />
      <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-2">
        {firstUser ? "Installatie voltooien" : "Account aanmaken"}
      </Button>
    </form>
  );
}

export function InviteForm({ token, email, userExists }: { token: string; email: string; userExists: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ redirect: string }>("/api/auth/invite", { token, name: userExists ? undefined : name, password });
      router.replace(res.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Accepteren mislukt");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="E-mailadres">
        <Input value={email} disabled className={darkField} />
      </Field>
      {!userExists && (
        <Field label="Je naam" htmlFor="name">
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={darkField} />
        </Field>
      )}
      <Field label={userExists ? "Je huidige wachtwoord" : "Kies een wachtwoord"} htmlFor="password">
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={darkField} autoComplete={userExists ? "current-password" : "new-password"} />
      </Field>
      <ErrorBox error={error} />
      <Button type="submit" variant="accent" size="lg" loading={loading}>
        Uitnodiging accepteren
      </Button>
    </form>
  );
}
