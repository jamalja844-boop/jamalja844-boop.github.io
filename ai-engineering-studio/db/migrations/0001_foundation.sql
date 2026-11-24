-- AI Engineering Studio – Fase 1: fundament
-- Gebruikers, organisaties, rollen & rechten, sessies, uitnodigingen,
-- versleutelde credentials, auditlog, rate limiting en job queue.

create extension if not exists citext;
create extension if not exists vector;

-- Runtime-rol waaronder alle tenant-queries draaien (RLS van toepassing).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'studio_app') then
    create role studio_app nologin;
  end if;
end $$;
grant studio_app to current_user;

create type org_role as enum ('owner', 'admin', 'developer', 'member', 'viewer');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function app_role_rank(r org_role) returns int
language sql immutable as $$
  select case r
    when 'owner' then 50 when 'admin' then 40 when 'developer' then 30
    when 'member' then 20 when 'viewer' then 10 else 0 end
$$;

-- ---------------------------------------------------------------------------
-- Gebruikers & sessies
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  password_hash text not null,
  avatar_color text not null default '#6EBEEB',
  is_platform_admin boolean not null default false,
  failed_login_count int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_name_len check (char_length(name) between 1 and 120)
);
create trigger users_updated before update on users for each row execute function set_updated_at();

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  ip text,
  user_agent text,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expiry_idx on sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Organisaties (workspaces) & lidmaatschappen
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_demo boolean not null default false,
  -- AVG: bewaartermijn (dagen) voor gesprekken, tooluitvoeringen en runs.
  retention_days int not null default 365,
  monthly_budget_usd numeric(12, 2),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint org_retention check (retention_days between 7 and 3650)
);
create trigger organizations_updated before update on organizations for each row execute function set_updated_at();

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

-- Rechtenmatrix: bron van waarheid voor applicatie en RLS.
create table role_permissions (
  role org_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into role_permissions (role, permission)
select r::org_role, p from (values
  ('org.manage', array['owner','admin']),
  ('members.manage', array['owner','admin']),
  ('credentials.manage', array['owner','admin']),
  ('audit.view', array['owner','admin']),
  ('approvals.decide', array['owner','admin']),
  ('models.manage', array['owner','admin','developer']),
  ('prompts.manage', array['owner','admin','developer']),
  ('apps.manage', array['owner','admin','developer']),
  ('tools.manage', array['owner','admin','developer']),
  ('knowledge.manage', array['owner','admin','developer']),
  ('agents.manage', array['owner','admin','developer']),
  ('workflows.manage', array['owner','admin','developer']),
  ('chat.use', array['owner','admin','developer','member']),
  ('apps.use', array['owner','admin','developer','member']),
  ('tools.execute', array['owner','admin','developer','member']),
  ('agents.run', array['owner','admin','developer','member']),
  ('workflows.run', array['owner','admin','developer','member']),
  ('dashboard.view', array['owner','admin','developer','member','viewer']),
  ('prompts.view', array['owner','admin','developer','member','viewer']),
  ('knowledge.view', array['owner','admin','developer','member','viewer']),
  ('agents.view', array['owner','admin','developer','member','viewer'])
) as t(p, roles), unnest(t.roles) as r;

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email citext not null,
  role org_role not null default 'member',
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on invitations(org_id);

-- ---------------------------------------------------------------------------
-- Versleutelde credentials (AI-providers en integraties). Waarde = AES-256-GCM.
-- ---------------------------------------------------------------------------
create table credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('llm', 'integration')),
  provider text not null,
  label text not null default 'standaard',
  encrypted_value text not null,
  value_hint text not null default '',
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'invalid')),
  last_verified_at timestamptz,
  last_error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, label)
);
create trigger credentials_updated before update on credentials for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Auditlog (append-only voor de applicatierol)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id bigserial primary key,
  org_id uuid references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'agent', 'system', 'app', 'workflow')),
  actor_label text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_org_time_idx on audit_logs(org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting (vaste vensters, gedeeld over alle app-instanties)
-- ---------------------------------------------------------------------------
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Job queue (FOR UPDATE SKIP LOCKED, retries met backoff, lease-timeouts)
-- ---------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled')),
  priority int not null default 0,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  result jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create trigger jobs_updated before update on jobs for each row execute function set_updated_at();
create index jobs_claim_idx on jobs(status, run_at, priority desc) where status in ('queued', 'running');
create index jobs_org_idx on jobs(org_id, created_at desc);
