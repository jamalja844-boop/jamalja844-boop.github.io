// Personal access tokens for the MCP server (Claude, Codex/ChatGPT). Only a SHA-256 hash is stored.
import crypto from "node:crypto";
import { db } from "./db";

export interface TokenData {
  name: string;
  hash: string;
  prefix: string;
  lastUsedAt?: string;
}

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function createToken(owner: string, name: string) {
  const token = `ads_${crypto.randomBytes(24).toString("base64url")}`;
  const row = await db.insert<TokenData>("tokens", owner, { name, hash: hash(token), prefix: token.slice(0, 10) });
  return { id: row.id, token };
}

export async function verifyToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !token.startsWith("ads_") || token.length > 100) return null;
  const h = hash(token);
  const row = (await db.list<TokenData>("tokens", null, { hash: h }))[0];
  if (!row) return null;
  const a = Buffer.from(row.data.hash);
  const b = Buffer.from(h);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!row.data.lastUsedAt || Date.now() - new Date(row.data.lastUsedAt).getTime() > 60_000) await db.update("tokens", row, { ...row.data, lastUsedAt: new Date().toISOString() });
  return row.owner_id;
}
