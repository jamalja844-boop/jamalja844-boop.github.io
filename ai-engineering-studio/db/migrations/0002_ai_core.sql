-- AI Engineering Studio – Fase 2: AI-kern
-- Modellen, gesprekken, berichten, verbruik/kosten, prompts met versies,
-- prompttests en AI-applicaties.

create table ai_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  model_id text not null,
  display_name text not null,
  kind text not null default 'chat' check (kind in ('chat', 'embedding')),
  context_window int,
  max_output_tokens int,
  -- Prijzen in USD per 1 miljoen tokens. NULL = onbekend (kosten worden dan niet geschat).
  input_price numeric(12, 4),
  output_price numeric(12, 4),
  supports_tools boolean not null default true,
  supports_json boolean not null default true,
  supports_temperature boolean not null default false,
  supports_effort boolean not null default false,
  embedding_dims int,
  is_enabled boolean not null default true,
  is_default boolean not null default false,
  source text not null default 'catalog' check (source in ('catalog', 'synced', 'manual')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, model_id)
);
create trigger ai_models_updated before update on ai_models for each row execute function set_updated_at();

create table prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  current_version int not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create trigger prompts_updated before update on prompts for each row execute function set_updated_at();

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  version int not null,
  role text not null default '',
  context text not null default '',
  goal text not null default '',
  system_prompt text not null default '',
  user_template text not null default '',
  -- [{name, description, default, required}]
  variables jsonb not null default '[]'::jsonb,
  output_format text not null default 'text' check (output_format in ('text', 'markdown', 'json', 'json_schema')),
  output_schema jsonb,
  model_provider text,
  model_id text,
  temperature numeric(3, 2),
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (prompt_id, version)
);
create index prompt_versions_prompt_idx on prompt_versions(prompt_id, version desc);

create table prompt_test_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  prompt_version int not null,
  batch_id uuid not null,
  provider text not null,
  model_id text not null,
  variables jsonb not null default '{}'::jsonb,
  rendered_system text not null default '',
  rendered_user text not null default '',
  output text,
  output_json jsonb,
  json_valid boolean,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(14, 6),
  latency_ms int,
  rating int check (rating between 1 and 5),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index prompt_test_runs_batch_idx on prompt_test_runs(batch_id);
create index prompt_test_runs_prompt_idx on prompt_test_runs(prompt_id, created_at desc);

create table ai_apps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  app_type text not null check (app_type in (
    'chatbot', 'customer_service', 'email_assistant', 'document_analysis',
    'quote_generator', 'data_assistant', 'internal_assistant', 'custom')),
  description text not null default '',
  -- {model:{provider,modelId}, promptId, systemPrompt, inputFields:[...], knowledgeBaseIds:[], toolKeys:[], output:{format, schema}}
  config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  min_role org_role not null default 'member',
  version int not null default 1,
  published_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint ai_apps_slug_format check (slug ~ '^[a-z0-9-]{2,60}$')
);
create trigger ai_apps_updated before update on ai_apps for each row execute function set_updated_at();

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null default 'Nieuw gesprek',
  provider text not null,
  model_id text not null,
  system_prompt text not null default '',
  prompt_id uuid references prompts(id) on delete set null,
  prompt_version int,
  app_id uuid references ai_apps(id) on delete set null,
  tool_keys text[] not null default '{}',
  knowledge_base_ids uuid[] not null default '{}',
  total_input_tokens int not null default 0,
  total_output_tokens int not null default 0,
  total_cost_usd numeric(14, 6) not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger conversations_updated before update on conversations for each row execute function set_updated_at();
create index conversations_user_idx on conversations(org_id, user_id, updated_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null default '',
  -- assistent: [{id, name, input}]
  tool_calls jsonb,
  tool_call_id text,
  tool_name text,
  is_error boolean not null default false,
  citations jsonb,
  metadata jsonb not null default '{}'::jsonb,
  provider text,
  model_id text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(14, 6),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conv_idx on messages(conversation_id, created_at);

create table usage_events (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  provider text not null,
  model_id text not null,
  source text not null check (source in ('chat', 'prompt_test', 'app', 'agent', 'orchestrator', 'workflow', 'embedding', 'verification')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_input_tokens int not null default 0,
  cost_usd numeric(14, 6),
  latency_ms int,
  success boolean not null default true,
  error_code text,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index usage_org_time_idx on usage_events(org_id, created_at desc);

create table app_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  app_id uuid not null references ai_apps(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output text,
  output_json jsonb,
  citations jsonb,
  tool_calls jsonb,
  status text not null default 'succeeded' check (status in ('running', 'succeeded', 'failed', 'waiting_approval')),
  error text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(14, 6),
  latency_ms int,
  created_at timestamptz not null default now()
);
create index app_runs_app_idx on app_runs(app_id, created_at desc);
