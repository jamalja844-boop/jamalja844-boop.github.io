import Link from "next/link";
import { requireUser, listMyOrgs } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import { Logo } from "@/components/shell/logo";
import { Badge } from "@/components/ui/misc";
import { CreateWorkspaceForm } from "@/components/workspaces/create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const user = await requireUser();
  const orgs = await listMyOrgs(user.id);
  return (
    <div className="dark min-h-dvh bg-navy-950 px-4 py-10 text-[#e8f0fa]">
      <div className="mx-auto max-w-3xl">
        <Logo />
        <h1 className="mt-10 text-2xl font-bold">Workspaces</h1>
        <p className="mt-1 text-sm text-navy-200">Elke workspace is volledig gescheiden: gegevens, agents, sleutels en rechten worden nooit gedeeld tussen bedrijven.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.slug}>
              <Link href={`/w/${o.slug}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-brand-sky/50 hover:bg-white/[0.07]">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-sky to-turq-400 font-bold text-navy-950">{o.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.name}</span>
                  <span className="text-xs text-navy-300">{ROLE_LABELS[o.role]}</span>
                </span>
                {o.is_demo && <Badge tone="demo">DEMO</Badge>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold">Nieuwe workspace</h2>
          <p className="mb-4 text-sm text-navy-200">Bijvoorbeeld voor een ander bedrijf, zoals NobleNest.</p>
          <CreateWorkspaceForm />
        </div>
      </div>
    </div>
  );
}
