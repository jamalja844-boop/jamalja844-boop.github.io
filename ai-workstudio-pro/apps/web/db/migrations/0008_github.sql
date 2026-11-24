-- AI WorkStudio Pro – fase 2: persoonlijke GitHub-koppeling, GitHub-projecten,
-- pushen en pull requests (altijd na expliciete bevestiging).

create table user_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('github')),
  encrypted_token text not null,
  account_login text not null,
  account_id text not null,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, provider)
);
create trigger user_connections_updated before update on user_connections for each row execute function set_updated_at();
grant select, insert, update, delete on user_connections to studio_app;
alter table user_connections enable row level security;
create policy own_rows on user_connections for all
  using (org_id = (select app_org_id()) and user_id = (select app_user_id()) and (select app_is_member()))
  with check (org_id = (select app_org_id()) and user_id = (select app_user_id()));

alter table code_projects drop constraint code_projects_source_type_check;
alter table code_projects add constraint code_projects_source_type_check check (source_type in ('template', 'git', 'local', 'github'));
alter table code_projects add column github_repo text check (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
alter table code_projects add column default_branch text;
alter table code_projects add column last_pr_url text;

alter table code_tasks add column work_branch text;
