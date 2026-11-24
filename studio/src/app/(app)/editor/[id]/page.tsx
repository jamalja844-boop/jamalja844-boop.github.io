import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import type { ProjectData } from "@/lib/models";
import { EditorLoader } from "./loader";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const { id } = await params;
  const row = await db.getOwned<ProjectData>("projects", id, u.id);
  if (!row) notFound();
  return <EditorLoader id={row.id} doc={row.data.doc} updatedAt={row.updated_at} />;
}
