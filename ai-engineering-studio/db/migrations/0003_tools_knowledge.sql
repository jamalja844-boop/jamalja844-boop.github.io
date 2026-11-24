-- AI Engineering Studio – Fase 3: tools, goedkeuringen, kennisbanken (RAG)
-- en interne bedrijfsgegevens.

create table tools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null,
  -- Implementatie: builtin-handler (bv. 'knowledge_search'), 'http', 'mcp'
  handler text not null,
  category text not null default 'algemeen',
  input_schema jsonb not null,
  output_schema jsonb,
  -- Niet-geheime configuratie (bv. toegestane domeinen, MCP-server-URL)
  config jsonb not null default '{}'::jsonb,
  credential_id uuid references credentials(id) on delete set null,
  -- read: alleen lezen; write: wijzigt gegevens; sensitive: extern/onomkeerbaar
  risk_level text not null default 'read' check (risk_level in ('read', 'write', 'sensitive')),
  requires_approval boolean not null default false,
  min_role org_role not null default 'member',
  is_enabled boolean not null default true,
  timeout_ms int not null default 20000 check (timeout_ms between 1000 and 120000),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key),
  constraint tools_key_format check (key ~ '^[a-z][a-z0-9_]{1,63}$')
);
create trigger tools_updated before update on tools for each row execute function set_updated_at();

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('tool_execution', 'workflow_step', 'publication')),
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'sensitive',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_by_user_id uuid references users(id) on delete set null,
  requested_by_agent_id uuid,
  agent_run_id uuid,
  workflow_run_id uuid,
  conversation_id uuid references conversations(id) on delete set null,
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index approvals_org_status_idx on approval_requests(org_id, status, created_at desc);

create table tool_executions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tool_id uuid references tools(id) on delete set null,
  tool_key text not null,
  actor_type text not null check (actor_type in ('user', 'agent', 'app', 'workflow', 'chat')),
  actor_id uuid,
  user_id uuid references users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  agent_run_id uuid,
  tool_call_id text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'running' check (status in ('pending_approval', 'running', 'succeeded', 'failed', 'rejected')),
  error text,
  injection_flags text[] not null default '{}',
  approval_id uuid references approval_requests(id) on delete set null,
  duration_ms int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index tool_exec_org_idx on tool_executions(org_id, created_at desc);
alter table approval_requests add column tool_execution_id uuid references tool_executions(id) on delete set null;

-- Kennisbanken ---------------------------------------------------------------
create table knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  min_role org_role not null default 'viewer',
  embedding_provider text,
  embedding_model text,
  chunk_size int not null default 1200 check (chunk_size between 200 and 8000),
  chunk_overlap int not null default 150 check (chunk_overlap between 0 and 2000),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger knowledge_bases_updated before update on knowledge_bases for each row execute function set_updated_at();

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  title text not null,
  filename text not null,
  mime_type text not null,
  size_bytes int not null,
  sha256 text not null,
  -- Toegangsrecht op documentniveau: minimaal vereiste rol om te lezen/vinden.
  min_role org_role not null default 'viewer',
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error text,
  chunk_count int not null default 0,
  char_count int not null default 0,
  has_embeddings boolean not null default false,
  version int not null default 1,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger documents_updated before update on documents for each row execute function set_updated_at();
create index documents_kb_idx on documents(knowledge_base_id, created_at desc);
create unique index documents_kb_sha_idx on documents(knowledge_base_id, sha256);

create table document_blobs (
  document_id uuid primary key references documents(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  data bytea not null
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_estimate int not null default 0,
  min_role org_role not null default 'viewer',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  tsv tsvector generated always as (to_tsvector('dutch', content)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index chunks_kb_idx on document_chunks(knowledge_base_id);
create index chunks_tsv_idx on document_chunks using gin (tsv);
create index chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);

-- Interne bedrijfsgegevens (CRM, offertes, klachten, ...) -------------------
-- Echte opslag binnen de organisatie; agents krijgen toegang per collectie.
create table records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  collection text not null,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'actief',
  is_demo boolean not null default false,
  created_by_type text not null default 'user' check (created_by_type in ('user', 'agent', 'workflow', 'app', 'system')),
  created_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_collection_format check (collection ~ '^[a-z][a-z_]{1,39}$')
);
create trigger records_updated before update on records for each row execute function set_updated_at();
create index records_org_coll_idx on records(org_id, collection, updated_at desc);
create index records_search_idx on records using gin (to_tsvector('dutch', title || ' ' || data::text));
