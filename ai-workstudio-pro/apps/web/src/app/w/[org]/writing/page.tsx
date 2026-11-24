import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { getUserPrefs, listStyles } from "@/lib/writing/service";
import { WritingStudio } from "@/components/writing/writing-studio";

export const metadata = { title: "Schrijfstudio" };

export default async function WritingPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org, "writing.use");
  const { styles, prefs } = await withTenant(ctx.tenant, async (tx) => ({ styles: await listStyles(tx), prefs: await getUserPrefs(tx) }));
  return (
    <Suspense>
      <WritingStudio slug={org} initialStyles={styles} initialPrefs={prefs} canManageStyles={ctx.can("styles.manage")} />
    </Suspense>
  );
}
