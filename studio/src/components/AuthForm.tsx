"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { DICTS, type Locale } from "@/lib/i18n/dict";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [locale, setLocale] = useState<Locale>("nl");
  const t = DICTS[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: mode === "login" ? { email, password } : { email, password, name, locale } });
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#2a1f5c,transparent_50%),radial-gradient(circle_at_80%_80%,#0e3a47,transparent_50%)] p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{t.appName}</h1>
          <select className="input w-auto py-1 text-xs" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            <option value="nl">NL</option>
            <option value="en">EN</option>
          </select>
        </div>
        <h2 className="text-2xl font-bold">{mode === "login" ? t.auth.login : t.auth.register}</h2>
        {mode === "register" && (
          <div><label className="label">{t.auth.name}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        )}
        <div><label className="label">{t.auth.email}</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label">{t.auth.password}</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === "register" ? 10 : 1} required /></div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{mode === "login" ? t.auth.login : t.auth.register}</button>
        <p className="text-center text-sm text-muted">
          {mode === "login" ? t.auth.noAccount : t.auth.haveAccount}{" "}
          <Link className="text-accent2" href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? t.auth.register : t.auth.login}</Link>
        </p>
      </form>
    </div>
  );
}
