"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { api, fmtDate } from "@/lib/client";
import { PageHeader } from "@/components/ui";

interface Tok { id: string; name: string; prefix: string; lastUsedAt?: string; createdAt: string }

const Code = ({ children }: { children: string }) => {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 pr-16 text-xs leading-relaxed">{children}</pre>
      <button className="btn-ghost btn-xs absolute right-2 top-2" onClick={() => { void navigator.clipboard.writeText(children); setOk(true); setTimeout(() => setOk(false), 1200); }}>{ok ? "✓" : "⧉"}</button>
    </div>
  );
};

export default function ConnectPage() {
  const { t, locale } = useT();
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [name, setName] = useState("Claude");
  const [fresh, setFresh] = useState("");
  const [origin, setOrigin] = useState("");
  const load = () => api<Tok[]>("/api/tokens").then(setTokens);
  useEffect(() => { setOrigin(window.location.origin); load(); }, []);
  const create = async () => { const r = await api<{ token: string }>("/api/tokens", { method: "POST", json: { name } }); setFresh(r.token); load(); };
  const revoke = async (id: string) => { if (confirm(t.common.confirm)) { await api(`/api/tokens/${id}`, { method: "DELETE" }); load(); } };
  const tok = fresh || "<TOKEN>";
  const url = `${origin}/api/mcp`;
  const nl = locale === "nl";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t.connect.title} subtitle={t.connect.subtitle} />
      <div className="card space-y-3">
        <h2 className="font-semibold">1. {t.connect.tokens}</h2>
        <div className="flex gap-2"><input className="input w-60" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.connect.name} /><button className="btn-primary" onClick={create}>+ {t.connect.newToken}</button></div>
        {fresh && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"><p className="mb-2">{t.connect.created}</p><Code>{fresh}</Code></div>}
        {tokens.map((k) => <div key={k.id} className="flex items-center justify-between border-b border-line py-1.5 text-sm"><span>{k.name} <span className="font-mono text-xs text-muted">{k.prefix}…</span></span><span className="flex items-center gap-3 text-xs text-muted">{t.connect.lastUsed}: {k.lastUsedAt ? fmtDate(k.lastUsedAt) : t.connect.never}<button className="btn-ghost btn-xs" onClick={() => revoke(k.id)}>{t.connect.revoke}</button></span></div>)}
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">2. {nl ? "Koppelen" : "Connect"}</h2>
        <p className="text-xs text-amber-200">{t.connect.publicNote}</p>
        <div><div className="label">Claude Code</div><Code>{`claude mcp add --transport http ad-studio ${url} --header "Authorization: Bearer ${tok}"`}</Code></div>
        <div>
          <div className="label">Claude Desktop / claude.ai</div>
          <p className="mb-1 text-xs text-muted">{nl ? "Instellingen → Connectors → Aangepaste connector toevoegen, en gebruik deze URL (het token zit in de URL, houd hem geheim):" : "Settings → Connectors → Add custom connector, and use this URL (the token is part of it; keep it secret):"}</p>
          <Code>{`${url}/t/${tok}`}</Code>
        </div>
        <div>
          <div className="label">Codex CLI (~/.codex/config.toml)</div>
          <Code>{`[mcp_servers.ad-studio]\nurl = "${url}"\nbearer_token_env_var = "AD_STUDIO_TOKEN"\n\n# ${nl ? "en in je terminal" : "and in your shell"}:\n# export AD_STUDIO_TOKEN=${tok}`}</Code>
          <p className="mt-2 text-xs text-muted">{nl ? "Ondersteunt jouw Codex-versie geen HTTP-servers? Gebruik dan de stdio-brug:" : "If your Codex version has no HTTP server support, use the stdio bridge:"}</p>
          <Code>{`[mcp_servers.ad-studio]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "${url}", "--header", "Authorization: Bearer ${tok}"]`}</Code>
        </div>
        <div>
          <div className="label">ChatGPT ({nl ? "ontwikkelaarsmodus" : "developer mode"})</div>
          <p className="mb-1 text-xs text-muted">{nl ? "Maak in ChatGPT een eigen connector (MCP) aan met deze URL en zonder extra authenticatie:" : "Create a custom (MCP) connector in ChatGPT with this URL and no extra authentication:"}</p>
          <Code>{`${url}/t/${tok}`}</Code>
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">3. {t.connect.examples}</h2>
        {t.connect.ex.map((e) => <div key={e} className="rounded-lg bg-bg p-3 text-sm">💬 {e}</div>)}
        <p className="text-xs text-muted">Tools: scan_shop, create_videos, get_video_job, list_videos, suggest_caption, list_social_accounts, schedule_post, auto_schedule, list_posts, cancel_post</p>
      </div>
    </div>
  );
}
