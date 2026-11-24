import { redirect } from "next/navigation";
import { currentUser, listMyOrgs } from "@/lib/auth/context";
import { needsSetup } from "@/lib/auth/service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect((await needsSetup()) ? "/setup" : "/login");
  const orgs = await listMyOrgs(user.id);
  if (!orgs.length) redirect("/workspaces");
  redirect(`/w/${orgs[0].slug}`);
}
