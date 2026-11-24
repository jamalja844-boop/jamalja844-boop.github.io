import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { currentUser } from "@/lib/auth/context";
import { needsSetup } from "@/lib/auth/service";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inloggen" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  if (await needsSetup()) redirect("/setup");
  return (
    <AuthShell title="Welkom terug" subtitle="Log in op je AI Engineering Studio.">
      <Suspense>
        <LoginForm />
      </Suspense>
      {env().ALLOW_SIGNUP === "true" && (
        <p className="mt-6 text-center text-sm text-navy-200">
          Nog geen account?{" "}
          <Link href="/setup" className="font-semibold text-brand-sky hover:underline">
            Registreren
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
