-- AI WorkStudio Pro – fase 1: AI Chat, schrijfdocumenten, schrijfstijlen,
-- persoonlijke instructies en AI Code (projecten, taken, stappen).

-- Nieuwe rechten ----------------------------------------------------------------
insert into role_permissions (role, permission)
select r::org_role, p from (values
  ('writing.use', array['owner','admin','developer','member']),
  ('styles.manage', array['owner','admin']),
  ('code.use', array['owner','admin','developer']),
  ('code.manage', array['owner','admin','developer'])
) as t(p, roles), unnest(t.roles) as r
on conflict do nothing;

-- AI Chat ------------------------------------------------------------------------
alter table conversations add column kind text not null default 'studio' check (kind in ('studio', 'chat'));
alter table conversations add column style_id uuid;
alter table conversations add column project_id uuid;
create index conversations_kind_idx on conversations(org_id, user_id, kind, updated_at desc);

create table writing_styles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  instructions text not null,
  is_default boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger writing_styles_updated before update on writing_styles for each row execute function set_updated_at();

create table user_instructions (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  instructions text not null default '',
  default_style_id uuid references writing_styles(id) on delete set null,
  default_language text not null default 'Nederlands',
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table conversations add constraint conversations_style_fk foreign key (style_id) references writing_styles(id) on delete set null;

-- Schrijfstudio: documenten met versiegeschiedenis --------------------------------
create table writing_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  kind text not null default 'document' check (kind in ('email', 'reply', 'document', 'report', 'translation', 'summary', 'analysis', 'message', 'other')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  shared boolean not null default false,
  version int not null default 1,
  source_conversation_id uuid references conversations(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger writing_documents_updated before update on writing_documents for each row execute function set_updated_at();
create index writing_documents_org_idx on writing_documents(org_id, updated_at desc);

create table writing_document_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references writing_documents(id) on delete cascade,
  version int not null,
  title text not null,
  content text not null,
  note text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, version)
);

-- AI Code ------------------------------------------------------------------------
create table code_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  source_type text not null check (source_type in ('template', 'git', 'local')),
  source_ref text not null default '',
  status text not null default 'ready' check (status in ('preparing', 'ready', 'failed')),
  error text,
  created_by uuid references users(id) on delete set null,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger code_projects_updated before update on code_projects for each row execute function set_updated_at();

alter table conversations add constraint conversations_project_fk foreign key (project_id) references code_projects(id) on delete set null;

create table code_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references code_projects(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'planning', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'limit_reached')),
  provider text not null,
  model_id text not null,
  plan jsonb,
  summary text,
  changed_files text[] not null default '{}',
  diff text,
  error text,
  max_steps int not null default 16 check (max_steps between 1 and 40),
  iterations int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(14, 6) not null default 0,
  state jsonb not null default '{}'::jsonb,
  pending_approval_id uuid references approval_requests(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create trigger code_tasks_updated before update on code_tasks for each row execute function set_updated_at();
create index code_tasks_project_idx on code_tasks(project_id, created_at desc);

create table code_task_steps (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references code_tasks(id) on delete cascade,
  step_index int not null,
  kind text not null check (kind in ('plan', 'read', 'write', 'edit', 'command', 'git', 'search', 'message', 'approval', 'error', 'final')),
  title text not null,
  detail text not null default '',
  data jsonb,
  status text not null default 'ok' check (status in ('ok', 'error', 'waiting')),
  created_at timestamptz not null default clock_timestamp()
);
create index code_task_steps_task_idx on code_task_steps(task_id, id);

-- Handmatige terminalcommando's (audit en geschiedenis)
create table code_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references code_projects(id) on delete cascade,
  task_id uuid references code_tasks(id) on delete set null,
  command text not null,
  network boolean not null default false,
  exit_code int,
  stdout text not null default '',
  stderr text not null default '',
  duration_ms int,
  timed_out boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index code_commands_project_idx on code_commands(project_id, created_at desc);

-- Goedkeuringen ook voor codecommando's (pakketinstallaties met netwerk)
alter table approval_requests drop constraint approval_requests_kind_check;
alter table approval_requests add constraint approval_requests_kind_check check (kind in ('tool_execution', 'workflow_step', 'publication', 'code_command'));
alter table approval_requests add column code_task_id uuid references code_tasks(id) on delete set null;

-- Jobs: nieuwe typen worden in de applicatie gevalideerd (geen enum).

-- RLS ----------------------------------------------------------------------------
grant select, insert, update, delete on writing_styles, user_instructions, writing_documents, writing_document_versions,
  code_projects, code_tasks, code_task_steps, code_commands to studio_app;
grant usage, select on sequence code_task_steps_id_seq to studio_app;

do $$
declare t text;
begin
  foreach t in array array['writing_styles', 'writing_document_versions', 'code_projects', 'code_tasks', 'code_task_steps', 'code_commands'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I for all
         using (org_id = (select app_org_id()) and (select app_is_member()))
         with check (org_id = (select app_org_id()) and (select app_is_member()))', t);
  end loop;
end $$;

-- Persoonlijke instructies: alleen de eigen rij.
alter table user_instructions enable row level security;
create policy user_instructions_own on user_instructions for all
  using (org_id = (select app_org_id()) and user_id = (select app_user_id()) and (select app_is_member()))
  with check (org_id = (select app_org_id()) and user_id = (select app_user_id()));

-- Documenten: eigen documenten of gedeelde documenten binnen de organisatie.
alter table writing_documents enable row level security;
create policy writing_documents_select on writing_documents for select
  using (org_id = (select app_org_id()) and (select app_is_member()) and (user_id = (select app_user_id()) or shared));
create policy writing_documents_insert on writing_documents for insert
  with check (org_id = (select app_org_id()) and (select app_is_member()) and user_id = (select app_user_id()));
create policy writing_documents_update on writing_documents for update
  using (org_id = (select app_org_id()) and (select app_is_member()) and (user_id = (select app_user_id()) or (shared and (select app_has_permission('styles.manage')))))
  with check (org_id = (select app_org_id()));
create policy writing_documents_delete on writing_documents for delete
  using (org_id = (select app_org_id()) and user_id = (select app_user_id()));

-- Versies volgen de zichtbaarheid van hun document.
create policy versions_follow_document on writing_document_versions as restrictive for all
  using (exists (select 1 from writing_documents d where d.id = writing_document_versions.document_id));
