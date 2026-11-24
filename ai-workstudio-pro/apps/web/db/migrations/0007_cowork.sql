-- AI WorkStudio Pro – fase 3 (Cowork): bijlagen in AI Chat, gegenereerde bestanden
-- (Word/PDF/Excel) en de taakplanner. Alles is privé per gebruiker binnen de organisatie.

insert into role_permissions (role, permission)
select r::org_role, 'cowork.use' from unnest(array['owner','admin','developer','member']) as r
on conflict do nothing;

-- Bijlagen: alleen de geëxtraheerde tekst (en tabellen) wordt bewaard, niet het originele bestand.
create table chat_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  filename text not null,
  file_type text not null check (file_type in ('pdf', 'docx', 'xlsx', 'csv', 'txt', 'md', 'json', 'html')),
  size_bytes int not null,
  sha256 text not null,
  extracted_text text not null,
  structured jsonb,
  pages int,
  chars int not null,
  injection_flags text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index chat_attachments_conv_idx on chat_attachments(conversation_id, created_at);
create index chat_attachments_user_idx on chat_attachments(org_id, user_id, created_at desc);

-- Gegenereerde bestanden (bijv. /excel, geplande taken).
create table cowork_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  source text not null check (source in ('excel_command', 'schedule', 'export')),
  filename text not null,
  format text not null check (format in ('xlsx', 'docx', 'pdf')),
  size_bytes int not null check (size_bytes <= 10485760),
  data bytea not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index cowork_files_user_idx on cowork_files(org_id, user_id, created_at desc);

-- Taakplanner
create table scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  prompt text not null,
  frequency text not null check (frequency in ('once', 'daily', 'weekdays', 'weekly', 'monthly')),
  time_of_day text not null check (time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekday int check (weekday between 1 and 7),
  day_of_month int check (day_of_month between 1 and 31),
  run_once_at timestamptz,
  timezone text not null default 'Europe/Amsterdam',
  provider text,
  model_id text,
  style_id uuid references writing_styles(id) on delete set null,
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger scheduled_tasks_updated before update on scheduled_tasks for each row execute function set_updated_at();
create index scheduled_tasks_due_idx on scheduled_tasks(next_run_at) where enabled;

create table scheduled_task_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references scheduled_tasks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  trigger text not null check (trigger in ('schedule', 'manual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  conversation_id uuid references conversations(id) on delete set null,
  document_id uuid references writing_documents(id) on delete set null,
  file_id uuid references cowork_files(id) on delete set null,
  summary text,
  error text,
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz
);
create index scheduled_task_runs_task_idx on scheduled_task_runs(task_id, created_at desc);

grant select, insert, update, delete on chat_attachments, cowork_files, scheduled_tasks, scheduled_task_runs to studio_app;

do $$
declare t text;
begin
  foreach t in array array['chat_attachments', 'cowork_files', 'scheduled_tasks', 'scheduled_task_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own_rows on %I for all
         using (org_id = (select app_org_id()) and user_id = (select app_user_id()) and (select app_is_member()))
         with check (org_id = (select app_org_id()) and user_id = (select app_user_id()))', t);
  end loop;
end $$;
