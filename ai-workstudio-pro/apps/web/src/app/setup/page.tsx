import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetupForm } from "@/components/auth/forms";
import { currentUser } from "@/lib/auth/context";
import { needsSetup } from "@/lib/auth/service";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Installatie" };

export default async function SetupPage() {
  if (await currentUser()) redirect("/");
  const first = await needsSetup();
  if (!first && env().ALLOW_SIGNUP !== "true") redirect("/login");
  return (
    <AuthShell
      title={first ? "Installatie" : "Account aanmaken"}
      subtitle={first ? "Maak het eerste beheerdersaccount en je eerste workspace aan." : "Maak een account met een eigen workspace."}
    >
      <SetupForm firstUser={first} />
    </AuthShell>
  );
}
