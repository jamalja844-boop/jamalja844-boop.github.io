import { z } from "zod";
import { db } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import type { BrandKitData } from "@/lib/models";

type P = { params: Promise<{ id: string }> };
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const font = z.string().regex(/^[A-Za-z0-9 ]{0,40}$/);
const Kit = z.object({
  name: z.string().min(1).max(120),
  website: z.string().url().or(z.literal("")).optional(),
  logoAssetId: z.string().optional(),
  colors: z.object({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }),
  fonts: z.object({ heading: font, body: font }),
  toneOfVoice: z.string().max(2000),
  contact: z.object({ email: z.string().max(200).optional(), phone: z.string().max(60).optional(), address: z.string().max(400).optional() }),
  products: z.array(z.object({ id: z.string(), name: z.string().max(200), description: z.string().max(5000), price: z.string().max(20).optional(), oldPrice: z.string().max(20).optional(), currency: z.string().max(8).optional(), url: z.string().max(500).optional(), imageAssetIds: z.array(z.string()).max(20), features: z.array(z.string().max(120)).max(10), externalId: z.string().optional(), source: z.enum(["manual", "shopify", "woocommerce", "website"]).optional() })).max(500),
  templateProjectIds: z.array(z.string()).max(200),
});

export const GET = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await db.getOwned<BrandKitData>("brandkits", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Brand kit not found");
  return { id: row.id, ...row.data };
});

export const PUT = handler(async (req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await db.getOwned<BrandKitData>("brandkits", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Brand kit not found");
  const data = Kit.parse(await req.json()) as BrandKitData;
  await db.update("brandkits", row, data);
  return { ok: true };
});

export const DELETE = handler(async (_req: Request, { params }: P) => {
  const u = await requireUser();
  const row = await db.getOwned<BrandKitData>("brandkits", (await params).id, u.id);
  if (!row) throw new HttpError(404, "Brand kit not found");
  await db.del("brandkits", row.id);
  return { ok: true };
});
