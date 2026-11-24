import { randomUUID } from "node:crypto";
import { withSystem, type TenantContext } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createOrganization } from "@/lib/orgs/service";
import type { OrgRole } from "@/lib/auth/rbac";
import { claimJob, completeJob, failJob } from "@/lib/jobs/queue";
import { handleJob } from "@/lib/jobs/handlers";

let pwHash: string | null = null;

export async function createUser(name = "Test") {
  pwHash ??= await hashPassword("Test-Wachtw00rd-123");
  const email = `${randomUUID().slice(0, 8)}@test.nl`;
  const [u] = await withSystem((tx) => tx<{ id: string }[]>`insert into users (email, name, password_hash) values (${email}, ${name}, ${pwHash!}) returning id`);
  return { id: u.id, email };
}

export async function createOrg(ownerId: string, name = "Testorg") {
  const slug = `t-${randomUUID().slice(0, 8)}`;
  const id = await withSystem((tx) => createOrganization(tx, { slug, name, ownerUserId: ownerId }));
  return { id, slug };
}

export async function addMember(orgId: string, userId: string, role: OrgRole) {
  await withSystem((tx) => tx`insert into memberships (org_id, user_id, role) values (${orgId}, ${userId}, ${role})`);
}

export async function setup(role: OrgRole = "owner") {
  const owner = await createUser("Eigenaar");
  const org = await createOrg(owner.id);
  let user = owner;
  if (role !== "owner") {
    user = await createUser(role);
    await addMember(org.id, user.id, role);
  }
  const ctx: TenantContext = { orgId: org.id, userId: user.id };
  const ownerCtx: TenantContext = { orgId: org.id, userId: owner.id };
  return { org, owner, user, ctx, ownerCtx };
}

/** Verwerkt alle openstaande jobs (zoals de worker), tot de wachtrij leeg is. */
export async function drainJobs(max = 100) {
  let n = 0;
  for (; n < max; n++) {
    const job = await claimJob();
    if (!job) break;
    try {
      await completeJob(job.id, await handleJob(job));
    } catch (e) {
      await failJob(job, (e as Error).message);
    }
  }
  return n;
}
