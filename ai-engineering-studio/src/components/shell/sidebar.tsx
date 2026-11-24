"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Blocks, Bot, Building2, Check, ChevronsUpDown, LayoutDashboard, Library, LogOut, Menu, MessagesSquare, Moon,
  Network, Plug, ScrollText, Settings, ShieldCheck, Sun, Workflow, X, Plus,
} from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { NAV } from "@/components/shell/nav";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client/api";

const ICONS = { LayoutDashboard, MessagesSquare, ScrollText, Blocks, Bot, Plug, Library, Network, Workflow, Building2, ShieldCheck, Settings };

export interface ShellProps {
  org: { slug: string; name: string; isDemo: boolean };
  orgs: { slug: string; name: string; is_demo: boolean; role: string }[];
  user: { name: string; email: string; avatarColor: string };
  roleLabel: string;
  pendingApprovals: number;
  children: React.ReactNode;
}

function NavLinks({ slug, pendingApprovals, onNavigate }: { slug: string; pendingApprovals: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4" aria-label="Hoofdmenu">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted/80">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = base + item.href;
              const active = item.href === "" ? pathname === base : pathname.startsWith(href);
              const Icon = ICONS[item.icon as keyof typeof ICONS];
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-white",
                      active && "bg-sidebar-active text-white",
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-brand-sky to-turq-400" />}
                    <Icon className={cn("size-[18px] shrink-0 text-sidebar-muted group-hover:text-brand-sky", active && "text-turq-300")} />
                    <span className="truncate">{item.label}</span>
                    {item.module && <span className="ml-auto font-mono text-[10px] text-sidebar-muted/60">M{item.module}</span>}
                    {item.badgeKey === "approvals" && pendingApprovals > 0 && (
                      <span className="ml-auto rounded-full bg-warning px-1.5 text-[10px] font-bold text-navy-950">{pendingApprovals}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function WorkspaceSwitcher({ org, orgs }: Pick<ShellProps, "org" | "orgs">) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="mx-3 mb-4 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]" aria-label="Workspace wisselen">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-sky to-turq-400 text-sm font-bold text-navy-950">
          {org.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{org.name}</span>
          <span className="block text-[11px] text-sidebar-muted">{org.isDemo ? "Demo-omgeving" : "Workspace"}</span>
        </span>
        <ChevronsUpDown className="size-4 text-sidebar-muted" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="start" sideOffset={6} className="z-50 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl animate-fade-in">
          <Dropdown.Label className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Workspaces</Dropdown.Label>
          {orgs.map((o) => (
            <Dropdown.Item key={o.slug} asChild>
              <Link href={`/w/${o.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none hover:bg-muted data-[highlighted]:bg-muted">
                <span className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold">{o.name.slice(0, 1)}</span>
                <span className="flex-1 truncate">{o.name}</span>
                {o.is_demo && <span className="text-[10px] font-semibold text-fuchsia-500">DEMO</span>}
                {o.slug === org.slug && <Check className="size-4 text-turq-500" />}
              </Link>
            </Dropdown.Item>
          ))}
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item asChild>
            <Link href="/workspaces" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted">
              <Plus className="size-4" /> Nieuwe workspace
            </Link>
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function UserBar({ user, roleLabel }: Pick<ShellProps, "user" | "roleLabel">) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="flex items-center gap-2 border-t border-white/8 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-navy-950" style={{ background: user.avatarColor }}>
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
        <p className="truncate text-[11px] text-sidebar-muted">{roleLabel}</p>
      </div>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="rounded-lg p-2 text-sidebar-muted hover:bg-white/5 hover:text-white"
        aria-label="Wissel licht/donker thema"
        title="Licht/donker thema"
      >
        {mounted && theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </button>
      <button type="button" onClick={logout} className="rounded-lg p-2 text-sidebar-muted hover:bg-white/5 hover:text-white" aria-label="Uitloggen" title="Uitloggen">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell(props: ShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between px-5 pb-5 pt-5">
        <Link href={`/w/${props.org.slug}`} aria-label="Naar dashboard">
          <Logo />
        </Link>
        <button className="rounded-lg p-1.5 text-sidebar-muted hover:bg-white/5 lg:hidden" onClick={() => setOpen(false)} aria-label="Menu sluiten">
          <X className="size-5" />
        </button>
      </div>
      <WorkspaceSwitcher org={props.org} orgs={props.orgs} />
      <NavLinks slug={props.org.slug} pendingApprovals={props.pendingApprovals} onNavigate={() => setOpen(false)} />
      <UserBar user={props.user} roleLabel={props.roleLabel} />
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[86%] max-w-[300px] animate-slide-up shadow-2xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Menu openen">
            <Menu className="size-5" />
          </button>
          <span className="truncate text-sm font-semibold">{props.org.name}</span>
          {props.pendingApprovals > 0 && (
            <Link href={`/w/${props.org.slug}/approvals`} className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-navy-950">
              {props.pendingApprovals} goedkeuring{props.pendingApprovals === 1 ? "" : "en"}
            </Link>
          )}
        </header>
        {props.org.isDemo && (
          <div className="border-b border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-1.5 text-center text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
            DEMO-OMGEVING — alle gegevens in deze workspace zijn voorbeeldgegevens en komen niet uit echte systemen.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{props.children}</main>
      </div>
    </div>
  );
}
