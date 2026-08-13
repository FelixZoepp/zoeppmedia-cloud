-- Playbook Tasks: auto-generated from playbook entries when a problem is detected

create table if not exists playbook_tasks (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  problem_id    uuid not null references agency_problems(id) on delete cascade,
  playbook_key  text not null,
  action_text   text not null,
  action_type   text not null check (action_type in ('immediate', 'long_term')),
  status        text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  assigned_to   uuid references users(id) on delete set null,
  notes         text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Indexes
create index if not exists playbook_tasks_agency_id_idx     on playbook_tasks(agency_id);
create index if not exists playbook_tasks_problem_id_idx    on playbook_tasks(problem_id);
create index if not exists playbook_tasks_assigned_to_idx   on playbook_tasks(assigned_to);
create index if not exists playbook_tasks_status_idx        on playbook_tasks(status);

-- RLS
alter table playbook_tasks enable row level security;

-- Internal users (admin + employee) can read all playbook tasks
create policy "internal_read_playbook_tasks"
  on playbook_tasks
  for select
  to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('admin', 'employee')
    )
  );

-- Internal users can insert playbook tasks
create policy "internal_insert_playbook_tasks"
  on playbook_tasks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('admin', 'employee')
    )
  );

-- Internal users can update playbook tasks
create policy "internal_update_playbook_tasks"
  on playbook_tasks
  for update
  to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('admin', 'employee')
    )
  );

-- Service role can do everything (used by detect.ts server-side)
create policy "service_all_playbook_tasks"
  on playbook_tasks
  for all
  to service_role
  using (true)
  with check (true);
