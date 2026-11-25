// Minimal document store with two drivers:
//  - PostgreSQL (incl. Supabase) when DATABASE_URL is set
//  - JSON files in ./storage/db otherwise (single-node dev / self-host)
// Every entity is { id, owner_id, data(jsonb), created_at, updated_at }.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";

export type CollectionName = "users" | "projects" | "versions" | "brandkits" | "media" | "renders" | "secrets" | "jobs" | "templates" | "posts" | "tokens";

export interface Row<T> {
  id: string;
  owner_id: string;
  data: T;
  created_at: string;
  updated_at: string;
}

interface Driver {
  list<T>(c: CollectionName, owner: string | null, filter?: Record<string, unknown>): Promise<Row<T>[]>;
  get<T>(c: CollectionName, id: string): Promise<Row<T> | null>;
  put<T>(c: CollectionName, row: Row<T>): Promise<void>;
  del(c: CollectionName, id: string): Promise<void>;
}

const matches = (data: unknown, filter?: Record<string, unknown>) =>
  !filter || Object.entries(filter).every(([k, v]) => (data as Record<string, unknown>)?.[k] === v);

/* ------------------------------ JSON driver ------------------------------ */
class JsonDriver implements Driver {
  private dir = path.join(config.storageDir, "db");
  private cache = new Map<CollectionName, Map<string, Row<unknown>>>();
  private locks = new Map<CollectionName, Promise<void>>();

  private file(c: CollectionName) {
    return path.join(this.dir, `${c}.json`);
  }
  private async load(c: CollectionName) {
    // Always re-read from disk: the render worker is a separate process.
    try {
      const raw = await fs.readFile(this.file(c), "utf8");
      const arr = JSON.parse(raw) as Row<unknown>[];
      const m = new Map(arr.map((r) => [r.id, r]));
      this.cache.set(c, m);
      return m;
    } catch {
      const m = this.cache.get(c) ?? new Map();
      this.cache.set(c, m);
      return m;
    }
  }
  private async save(c: CollectionName, m: Map<string, Row<unknown>>) {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(c)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, JSON.stringify([...m.values()]));
    await fs.rename(tmp, this.file(c));
  }
  private async withLock<R>(c: CollectionName, fn: () => Promise<R>): Promise<R> {
    const prev = this.locks.get(c) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    this.locks.set(c, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async list<T>(c: CollectionName, owner: string | null, filter?: Record<string, unknown>) {
    const m = await this.load(c);
    return ([...m.values()] as Row<T>[])
      .filter((r) => (owner === null || r.owner_id === owner) && matches(r.data, filter))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async get<T>(c: CollectionName, id: string) {
    const m = await this.load(c);
    return (m.get(id) as Row<T>) ?? null;
  }
  async put<T>(c: CollectionName, row: Row<T>) {
    await this.withLock(c, async () => {
      const m = await this.load(c);
      m.set(row.id, row as Row<unknown>);
      await this.save(c, m);
    });
  }
  async del(c: CollectionName, id: string) {
    await this.withLock(c, async () => {
      const m = await this.load(c);
      m.delete(id);
      await this.save(c, m);
    });
  }
}

/* ---------------------------- Postgres driver ---------------------------- */
class PgDriver implements Driver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any;
  private ready: Promise<void>;
  constructor(url: string) {
    this.ready = (async () => {
      const { Pool } = await import("pg");
      this.pool = new Pool({ connectionString: url, max: 10, ssl: /supabase|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
      await this.pool.query(SCHEMA_SQL);
    })();
  }
  async list<T>(c: CollectionName, owner: string | null, filter?: Record<string, unknown>) {
    await this.ready;
    const params: unknown[] = [c];
    let sql = "select * from entities where collection = $1";
    if (owner !== null) {
      params.push(owner);
      sql += ` and owner_id = $${params.length}`;
    }
    if (filter && Object.keys(filter).length) {
      params.push(JSON.stringify(filter));
      sql += ` and data @> $${params.length}::jsonb`;
    }
    sql += " order by updated_at desc";
    const r = await this.pool.query(sql, params);
    return r.rows.map(toRow) as Row<T>[];
  }
  async get<T>(c: CollectionName, id: string) {
    await this.ready;
    const r = await this.pool.query("select * from entities where collection = $1 and id = $2", [c, id]);
    return r.rows[0] ? (toRow(r.rows[0]) as Row<T>) : null;
  }
  async put<T>(c: CollectionName, row: Row<T>) {
    await this.ready;
    await this.pool.query(
      `insert into entities (collection, id, owner_id, data, created_at, updated_at) values ($1,$2,$3,$4,$5,$6)
       on conflict (collection, id) do update set data = excluded.data, updated_at = excluded.updated_at, owner_id = excluded.owner_id`,
      [c, row.id, row.owner_id, JSON.stringify(row.data), row.created_at, row.updated_at],
    );
  }
  async del(c: CollectionName, id: string) {
    await this.ready;
    await this.pool.query("delete from entities where collection = $1 and id = $2", [c, id]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRow = (r: any): Row<unknown> => ({ id: r.id, owner_id: r.owner_id, data: r.data, created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString() });

export const SCHEMA_SQL = `
create table if not exists entities (
  collection text not null,
  id text not null,
  owner_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists entities_owner_idx on entities (collection, owner_id, updated_at desc);
create index if not exists entities_data_idx on entities using gin (data jsonb_path_ops);
`;

const g = globalThis as unknown as { __adDb?: Driver };
export const driver: Driver = g.__adDb ?? (g.__adDb = config.databaseUrl ? new PgDriver(config.databaseUrl) : new JsonDriver());

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;

export const db = {
  list: <T>(c: CollectionName, owner: string | null, filter?: Record<string, unknown>) => driver.list<T>(c, owner, filter),
  get: <T>(c: CollectionName, id: string) => driver.get<T>(c, id),
  /** get, enforcing ownership */
  getOwned: async <T>(c: CollectionName, id: string, owner: string) => {
    const r = await driver.get<T>(c, id);
    return r && r.owner_id === owner ? r : null;
  },
  insert: async <T>(c: CollectionName, owner: string, data: T, id?: string) => {
    const now = new Date().toISOString();
    const row: Row<T> = { id: id ?? newId(c.slice(0, 3)), owner_id: owner, data, created_at: now, updated_at: now };
    await driver.put(c, row);
    return row;
  },
  update: async <T>(c: CollectionName, row: Row<T>, data: T) => {
    const next: Row<T> = { ...row, data, updated_at: new Date().toISOString() };
    await driver.put(c, next);
    return next;
  },
  del: (c: CollectionName, id: string) => driver.del(c, id),
};
