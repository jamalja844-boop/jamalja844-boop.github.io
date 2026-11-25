"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { I18nProvider, useT } from "@/lib/i18n/context";
import { api } from "@/lib/client";
import type { SessionUser } from "@/lib/server/auth";

const NAV: { href: string; key: keyof ReturnType<typeof useT>["t"]["nav"]; icon: string; group?: string }[] = [
  { href: "/shop", key: "shop" as never, icon: "🛒" },
  { href: "/", key: "dashboard", icon: "◧" },
  { href: "/create", key: "create", icon: "✦" },
  { href: "/ai-video", key: "aiVideo", icon: "◉" },
  { href: "/create?source=url", key: "website", icon: "⌘", group: "sub" },
  { href: "/create?source=product", key: "product", icon: "▣", group: "sub" },
  { href: "/create?source=image", key: "image", icon: "▨", group: "sub" },
  { href: "/create?source=text", key: "text", icon: "¶", group: "sub" },
  { href: "/projects", key: "editor", icon: "✎" },
  { href: "/brand-kits", key: "brandKits", icon: "◆" },
  { href: "/templates", key: "templates", icon: "▤" },
  { href: "/projects", key: "projects", icon: "▦" },
  { href: "/renders", key: "renders", icon: "⟳" },
  { href: "/media", key: "media", icon: "▩" },
  { href: "/settings", key: "settings", icon: "⚙" },
  { href: "/exports", key: "exports", icon: "⇩" },
];

function Inner({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { t, locale } = useT();
  const path = usePathname();
  const full = path.startsWith("/editor");
  const setLocale = async (l: string) => {
    await api("/api/auth/me", { method: "PATCH", json: { locale: l } });
    window.location.reload();
  };
  if (full) return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="px-4 py-4 text-sm font-bold tracking-tight">
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">AI Video Ads</span> Studio
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path === n.href.split("?")[0] && !n.group;
            return (
              <Link key={n.key} href={n.href} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${n.group ? "pl-7 text-xs text-muted" : ""} ${active ? "bg-accent/20 text-white" : "text-gray-300 hover:bg-panel2"}`}>
                <span className="w-4 text-center opacity-70">{n.icon}</span>
                {n.key === ("shop" as never) ? t.shop.nav : t.nav[n.key]}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-line p-3 text-xs">
          <div className="truncate text-muted">{user.email}</div>
          <div className="flex gap-2">
            <select className="input py-1 text-xs" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </select>
            <button className="btn-ghost btn-xs" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>{t.nav.logout}</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <I18nProvider locale={user.locale}>
      <Inner user={user}>{children}</Inner>
    </I18nProvider>
  );
}
