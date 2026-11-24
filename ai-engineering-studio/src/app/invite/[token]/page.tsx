import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteForm } from "@/components/auth/forms";
import { getInvitation } from "@/lib/auth/service";
import { ROLE_LABELS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uitnodiging" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await getInvitation(token) : null;
  if (!inv) {
    return (
      <AuthShell title="Uitnodiging ongeldig" subtitle="Deze link is verlopen of al gebruikt.">
        <Link href="/login" className="font-semibold text-brand-sky hover:underline">Naar inloggen</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Word lid van ${inv.org_name}`} subtitle={`Je bent uitgenodigd als ${ROLE_LABELS[inv.role]}.`}>
      <InviteForm token={token} email={inv.email} userExists={inv.user_exists} />
    </AuthShell>
  );
}
