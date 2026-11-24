-- AI Engineering Studio – Fase 4/5: agents, taken, uitvoeringen,
-- multi-agent orchestratie en workflows.

create table agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  role_title text not null default '',
  department text not null default 'Algemeen',
  responsibilities text not null default '',
  goals jsonb not null default '[]'::jsonb,
  provider text not null,
  model_id text not null,
  system_prompt text not null default '',
  prompt_id uuid references prompts(id) on delete set null,
  -- Collecties in `records` die deze agent mag lezen/schrijven.
  data_scopes text[] not null default '{}',
  -- Met welke agents (keys) deze agent zijn resultaten mag delen; '*' = iedereen.
  share_with text[] not null default '{}',
  -- Hoogste documentniveau dat de agent mag lezen.
  clearance org_role not null default 'member',
  max_steps int not null default 8 check (max_steps between 1 and 50),
  max_duration_s int not null default 180 check (max_duration_s between 10 and 3600),
  max_cost_usd numeric(10, 4) not null default 0.50 check (max_cost_usd > 0),
  status text not null default 'idle' check (status in ('idle', 'working', 'waiting_approval', 'error', 'disabled')),
  status_detail text,
  avatar_color text not null default '#2DD4BF',
  office_position jsonb not null default '{}'::jsonb,
  template_key text,
  is_enabled boolean not null default true,
  last_active_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key),
  constraint agents_key_format check (key ~ '^[a-z][a-z0-9_]{1,40}$')
);
create trigger agents_updated before update on agents for each row execute function set_updated_at();

create table agent_tools (
  agent_id uuid not null references agents(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  primary key (agent_id, tool_id)
);

create table agent_knowledge_bases (
  agent_id uuid not null references agents(id) on delete cascade,
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  primary key (agent_id, knowledge_base_id)
);

create table orchestrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  goal text not null,
  status text not null default 'planning' check (status in ('planning', 'running', 'waiting_approval', 'reporting', 'completed', 'failed', 'cancelled')),
  provider text not null,
  model_id text not null,
  -- {analysis, subtasks:[{id,title,instructions,agent_key,depends_on}]}
  plan jsonb,
  final_report text,
  error text,
  max_cost_usd numeric(10, 4) not null default 2.00,
  cost_usd numeric(14, 6) not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create trigger orchestrations_updated before update on orchestrations for each row execute function set_updated_at();
create index orchestrations_org_idx on orchestrations(org_id, created_at desc);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  -- React Flow-graaf: {nodes:[{id,type,position,data}], edges:[{id,source,target}]}
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version int not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger workflows_updated before update on workflows for each row execute function set_updated_at();

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  workflow_version int not null,
  graph jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  error text,
  cost_usd numeric(14, 6) not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create trigger workflow_runs_updated before update on workflow_runs for each row execute function set_updated_at();
create index workflow_runs_wf_idx on workflow_runs(workflow_id, created_at desc);

create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  orchestration_id uuid references orchestrations(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete cascade,
  plan_key text,
  title text not null,
  instructions text not null,
  input jsonb not null default '{}'::jsonb,
  depends_on text[] not null default '{}',
  status text not null default 'queued' check (status in ('blocked', 'queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  priority int not null default 0,
  result text,
  result_json jsonb,
  error text,
  created_by uuid references users(id) on delete set null,
  -- clock_timestamp: taken uit één plan behouden hun volgorde binnen dezelfde transactie.
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create trigger agent_tasks_updated before update on agent_tasks for each row execute function set_updated_at();
create index agent_tasks_agent_idx on agent_tasks(agent_id, created_at desc);
create index agent_tasks_orch_idx on agent_tasks(orchestration_id);
create index agent_tasks_status_idx on agent_tasks(org_id, status);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  task_id uuid references agent_tasks(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'limit_reached')),
  provider text not null,
  model_id text not null,
  -- Hervatbare toestand: {plan, messages, toolNames, startedAtMs}
  state jsonb not null default '{}'::jsonb,
  plan jsonb,
  output text,
  verification jsonb,
  steps_count int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(14, 6) not null default 0,
  error text,
  pending_approval_id uuid references approval_requests(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create trigger agent_runs_updated before update on agent_runs for each row execute function set_updated_at();
create index agent_runs_agent_idx on agent_runs(agent_id, created_at desc);

create table agent_run_steps (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  step_index int not null,
  phase text not null check (phase in ('understand', 'plan', 'tool_select', 'act', 'verify', 'next', 'final', 'error', 'approval', 'limit')),
  title text not null,
  content text not null default '',
  tool_key text,
  tool_input jsonb,
  tool_output jsonb,
  status text not null default 'ok' check (status in ('ok', 'error', 'waiting', 'rejected')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index agent_run_steps_run_idx on agent_run_steps(run_id, id);

create table workflow_node_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null references workflow_runs(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'waiting_approval', 'succeeded', 'failed', 'skipped')),
  input jsonb,
  output jsonb,
  error text,
  agent_task_id uuid references agent_tasks(id) on delete set null,
  approval_id uuid references approval_requests(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, node_id)
);

alter table approval_requests
  add constraint approval_agent_fk foreign key (requested_by_agent_id) references agents(id) on delete set null,
  add constraint approval_run_fk foreign key (agent_run_id) references agent_runs(id) on delete set null,
  add constraint approval_wf_fk foreign key (workflow_run_id) references workflow_runs(id) on delete set null;
alter table tool_executions
  add constraint tool_exec_run_fk foreign key (agent_run_id) references agent_runs(id) on delete set null;
