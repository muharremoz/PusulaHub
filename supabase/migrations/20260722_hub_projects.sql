-- ============================================================================
-- Faz 4: Projects modülü — mssql → Supabase (hub schema)
-- Tablolar: projects, project_columns, project_tasks, project_subtasks,
--           project_task_comments, project_activity_log
-- ============================================================================
-- company_id: Companies henüz mssql'de (5758 satır, taşınmadı) → FK YOK, soft ref
--   (mssql Companies.Id GUID'i text olarak). Firma adı gerekirse mssql lookup.
-- assigned_to / author / user_id: eski isim string'leri → auth.users(id) uuid
--   (kopyalarken isim→uuid eşlenir; UI isim beklediği için resolveCreators ile çözülür).
-- ============================================================================

-- ── hub.projects ─────────────────────────────────────────────────────────────
create table if not exists hub.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  status      text        not null default 'active',
  company_id  text,                                   -- soft ref → mssql Companies.Id
  color       text        not null default '#3b82f6',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── hub.project_columns ──────────────────────────────────────────────────────
create table if not exists hub.project_columns (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references hub.projects(id) on delete cascade,
  name       text not null,
  color      text not null default '#6b7280',
  position   int  not null default 0,
  wip_limit  int
);
create index if not exists project_columns_project_idx on hub.project_columns (project_id, position);

-- ── hub.project_tasks ────────────────────────────────────────────────────────
create table if not exists hub.project_tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references hub.projects(id)        on delete cascade,
  column_id       uuid not null references hub.project_columns(id) on delete cascade,
  title           text not null,
  description     text,
  priority        text not null default 'medium',
  assigned_to     uuid references auth.users(id) on delete set null,
  due_date        date,
  labels          text,
  position        int  not null default 0,
  estimated_hours double precision,
  actual_hours    double precision,
  start_date      date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists project_tasks_column_idx  on hub.project_tasks (column_id, position);
create index if not exists project_tasks_project_idx on hub.project_tasks (project_id);

-- ── hub.project_subtasks ─────────────────────────────────────────────────────
create table if not exists hub.project_subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references hub.project_tasks(id) on delete cascade,
  title      text not null,
  completed  boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_subtasks_task_idx on hub.project_subtasks (task_id, position);

-- ── hub.project_task_comments ────────────────────────────────────────────────
create table if not exists hub.project_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references hub.project_tasks(id) on delete cascade,
  author     uuid references auth.users(id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists project_task_comments_task_idx on hub.project_task_comments (task_id, created_at);

-- ── hub.project_activity_log ─────────────────────────────────────────────────
create table if not exists hub.project_activity_log (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references hub.projects(id)      on delete cascade,
  task_id    uuid references hub.project_tasks(id)          on delete set null,
  user_id    uuid references auth.users(id)                 on delete set null,
  user_name  text not null default 'Sistem',                -- denormalize snapshot (mssql ile aynı)
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists project_activity_project_idx on hub.project_activity_log (project_id, created_at desc);

-- ── RLS: authenticated tam erişim ────────────────────────────────────────────
alter table hub.projects             enable row level security;
alter table hub.project_columns      enable row level security;
alter table hub.project_tasks        enable row level security;
alter table hub.project_subtasks     enable row level security;
alter table hub.project_task_comments enable row level security;
alter table hub.project_activity_log enable row level security;

create policy "hub authed full" on hub.projects             for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.project_columns      for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.project_tasks        for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.project_subtasks     for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.project_task_comments for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.project_activity_log for all to authenticated using (true) with check (true);

grant all on hub.projects, hub.project_columns, hub.project_tasks,
             hub.project_subtasks, hub.project_task_comments, hub.project_activity_log
  to authenticated, service_role;
