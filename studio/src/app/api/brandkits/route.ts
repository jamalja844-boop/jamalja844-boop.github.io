import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { BrandKitData } from "@/lib/models";

export const GET = handler(async () => {
  const u = await requireUser();
  return (await db.list<BrandKitData>("brandkits", u.id)).map((r) => ({ id: r.id, updatedAt: r.updated_at, ...r.data }));
});

export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const { name } = z.object({ name: z.string().min(1).max(120) }).parse(await req.json());
  const row = await db.insert<BrandKitData>("brandkits", u.id, {
    name, colors: { primary: "#7c5cff", secondary: "#22d3ee", accent: "#f97316", background: "#0b0d12", text: "#ffffff" },
    fonts: { heading: "Poppins", body: "Inter" }, toneOfVoice: "", contact: {}, products: [], templateProjectIds: [],
  });
  return { id: row.id };
});
