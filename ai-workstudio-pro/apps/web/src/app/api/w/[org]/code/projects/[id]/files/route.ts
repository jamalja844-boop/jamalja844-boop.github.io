import { z } from "zod";
import { deletePath, listTree, readText, writeText } from "@workstudio/code-execution";
import { writeFileSchema } from "@workstudio/shared";
import { orgHandler, parseJson } from "@/lib/api/handler";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { codeOp, openProject } from "@/lib/code/projects";

type P = { org: string; id: string };
const pathSchema = z.string().min(1).max(500);

/** Zonder ?path: bestandsboom. Met ?path: inhoud van het bestand. */
export const GET = orgHandler<P>({ permission: "code.use" }, async ({ req, ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const { dir } = await openProject(ctx.tenant, projectId);
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return { tree: await codeOp(() => listTree(dir)) };
  const file = await codeOp(() => readText(dir, pathSchema.parse(path)));
  return { path, content: file.content, totalLines: file.totalLines };
});

export const PUT = orgHandler<P>({ permission: "code.use", rate: { name: "code-write", limit: 240, windowSec: 60 } }, async ({ req, ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const input = await parseJson(req, writeFileSchema, 2_500_000);
  const { dir } = await openProject(ctx.tenant, projectId);
  const r = await codeOp(() => writeText(dir, input.path, input.content));
  return r;
});

export const DELETE = orgHandler<P>({ permission: "code.use" }, async ({ req, ctx, params }) => {
  const projectId = z.string().uuid().parse(params.id);
  const path = pathSchema.parse(req.nextUrl.searchParams.get("path"));
  const { dir } = await openProject(ctx.tenant, projectId);
  await codeOp(() => deletePath(dir, path));
  await withTenant(ctx.tenant, (tx) => audit(tx, { action: "code.file_deleted", targetType: "code_project", targetId: projectId, metadata: { path } }));
  return { ok: true };
});
