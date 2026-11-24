-- AI Engineering Studio – Row Level Security & rechten
--
-- Model: de applicatie voert elke tenant-transactie uit met
--   SET LOCAL ROLE studio_app;
--   set_config('app.user_id', <uuid>, true); set_config('app.org_id', <uuid>, true);
-- Daardoor zijn álle onderstaande policies van kracht, ook als applicatiecode
-- per ongeluk een filter vergeet. Organisaties kunnen elkaars gegevens nooit zien.

-- ---------------------------------------------------------------------------
-- Contextfuncties
-- ---------------------------------------------------------------------------
create or replace function app_user_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_org_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create or replace function app_is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships m
    where m.org_id = app_org_id() and m.user_id = app_user_id())
$$;

create or replace function app_is_member_of(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target and m.user_id = app_user_id())
$$;

create or replace function app_role_rank_current() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select app_role_rank(m.role) from memberships m
    where m.org_id = app_org_id() and m.user_id = app_user_id()), 0)
$$;

create or replace function app_has_permission(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships m
    join role_permissions rp on rp.role = m.role
    where m.org_id = app_org_id() and m.user_id = app_user_id() and rp.permission = p)
$$;

create or replace function app_shares_org(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships a
    join memberships b on a.org_id = b.org_id
    where a.user_id = app_user_id() and b.user_id = target)
$$;

-- ---------------------------------------------------------------------------
-- Rechten voor de runtime-rol
-- ---------------------------------------------------------------------------
grant usage on schema public to studio_app;
grant select, insert, update, delete on all tables in schema public to studio_app;
grant usage, select on all sequences in schema public to studio_app;
grant execute on all functions in schema public to studio_app;

-- Alleen de systeemcontext (authenticatie, worker) mag hierbij.
revoke all on sessions, rate_limits from studio_app;
-- Auditlog is append-only voor de applicatie.
revoke update, delete on audit_logs from studio_app;
-- Wachtwoordhashes zijn nooit leesbaar voor de applicatierol.
revoke select, insert, update, delete on users from studio_app;
grant select (id, email, name, avatar_color, last_login_at, created_at) on users to studio_app;
grant update (name, avatar_color) on users to studio_app;
-- Rechtenmatrix is alleen-lezen.
revoke insert, update, delete on role_permissions from studio_app;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table users enable row level security;
create policy users_select on users for select
  using (id = (select app_user_id()) or app_shares_org(id));
create policy users_update_self on users for update
  using (id = (select app_user_id())) with check (id = (select app_user_id()));

alter table organizations enable row level security;
create policy org_select on organizations for select using (app_is_member_of(id));
create policy org_update on organizations for update
  using (id = (select app_org_id()) and (select app_has_permission('org.manage')))
  with check (id = (select app_org_id()));

alter table memberships enable row level security;
create policy memberships_select on memberships for select
  using (user_id = (select app_user_id()) or (org_id = (select app_org_id()) and (select app_is_member())));
create policy memberships_write on memberships for all
  using (org_id = (select app_org_id()) and (select app_has_permission('members.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('members.manage')));

alter table role_permissions enable row level security;
create policy role_permissions_read on role_permissions for select using (true);

alter table invitations enable row level security;
create policy invitations_admin on invitations for all
  using (org_id = (select app_org_id()) and (select app_has_permission('members.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('members.manage')));

alter table credentials enable row level security;
create policy credentials_select on credentials for select
  using (org_id = (select app_org_id()) and (select app_is_member()));
create policy credentials_write on credentials for insert
  with check (org_id = (select app_org_id()) and (select app_has_permission('credentials.manage')));
create policy credentials_update on credentials for update
  using (org_id = (select app_org_id()) and (select app_has_permission('credentials.manage')))
  with check (org_id = (select app_org_id()));
create policy credentials_delete on credentials for delete
  using (org_id = (select app_org_id()) and (select app_has_permission('credentials.manage')));

alter table audit_logs enable row level security;
create policy audit_insert on audit_logs for insert
  with check (org_id = (select app_org_id()) and (select app_is_member()));
create policy audit_select on audit_logs for select
  using (org_id = (select app_org_id()) and (select app_has_permission('audit.view')));

-- Standaard tenant-isolatie voor alle overige organisatietabellen.
do $$
declare t text;
begin
  foreach t in array array[
    'jobs', 'ai_models', 'prompts', 'prompt_versions', 'prompt_test_runs', 'ai_apps',
    'conversations', 'messages', 'usage_events', 'app_runs', 'tools', 'approval_requests',
    'tool_executions', 'records', 'agents', 'agent_tools', 'agent_knowledge_bases',
    'orchestrations', 'workflows', 'workflow_runs', 'agent_tasks', 'agent_runs',
    'agent_run_steps', 'workflow_node_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I for all
         using (org_id = (select app_org_id()) and (select app_is_member()))
         with check (org_id = (select app_org_id()) and (select app_is_member()))', t);
  end loop;
end $$;

-- Gesprekken zijn persoonlijk: alleen de eigenaar ziet ze.
create policy conversations_owner on conversations as restrictive for all
  using (user_id = (select app_user_id())) with check (user_id = (select app_user_id()));
create policy messages_owner on messages as restrictive for all
  using (exists (select 1 from conversations c where c.id = messages.conversation_id));

-- Kennisbanken en documenten: toegangsrecht op basis van rol.
alter table knowledge_bases enable row level security;
create policy kb_select on knowledge_bases for select
  using (org_id = (select app_org_id()) and app_role_rank(min_role) <= (select app_role_rank_current()));
create policy kb_write on knowledge_bases for all
  using (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')));

alter table documents enable row level security;
create policy documents_select on documents for select
  using (org_id = (select app_org_id()) and app_role_rank(min_role) <= (select app_role_rank_current()));
create policy documents_write on documents for all
  using (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')));

alter table document_blobs enable row level security;
create policy blobs_select on document_blobs for select
  using (org_id = (select app_org_id()) and exists (select 1 from documents d where d.id = document_blobs.document_id));
create policy blobs_write on document_blobs for all
  using (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')));

alter table document_chunks enable row level security;
create policy chunks_select on document_chunks for select
  using (org_id = (select app_org_id()) and app_role_rank(min_role) <= (select app_role_rank_current()));
create policy chunks_write on document_chunks for all
  using (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')))
  with check (org_id = (select app_org_id()) and (select app_has_permission('knowledge.manage')));
