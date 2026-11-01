-- Live fehlten trotz eingetragener Migrationen (20260811000005, 20260826000007, 20260906000002):
--  * Tabelle recurring_fulfillment_tasks → Fahrplan-Call-/Reels-Aufgaben aus cron/daily schlugen fehl (404)
--  * View unified_tasks → Heute-Seite, Kapazität und 1-Klick-Erledigung ohne Daten
-- Außerdem lehnte fulfillment_tasks den Typ 'backup_ad_account' ab (cron/daily, Schritt 4).
-- Alles idempotent.

create table if not exists public.recurring_fulfillment_tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  task_key text not null,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  due_date date,
  assigned_to uuid references public.users(id),
  triggered_by text check (triggered_by in ('schedule', 'problem', 'manual')),
  problem_id uuid references public.agency_problems(id),
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.recurring_fulfillment_tasks drop constraint if exists recurring_fulfillment_tasks_task_key_check;
alter table public.recurring_fulfillment_tasks add constraint recurring_fulfillment_tasks_task_key_check
  check (task_key in ('indeed_restart', 'creatives_test', 'reels_create', 'video_shoot_plan', 'fahrplan_call'));

create index if not exists idx_recurring_tasks_agency on public.recurring_fulfillment_tasks(agency_id);
create index if not exists idx_recurring_tasks_status on public.recurring_fulfillment_tasks(status) where status != 'done';
create index if not exists idx_recurring_tasks_due on public.recurring_fulfillment_tasks(due_date) where status = 'pending';

alter table public.recurring_fulfillment_tasks enable row level security;
drop policy if exists "Internal users can manage recurring tasks" on public.recurring_fulfillment_tasks;
create policy "Internal users can manage recurring tasks"
  on public.recurring_fulfillment_tasks for all
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'));

-- security_invoker: die RLS der Quelltabellen gilt auch über die View (keine Mandanten-Lücke)
create or replace view public.unified_tasks with (security_invoker = true) as
SELECT
  id,
  'internal' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  priority::text,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM internal_tasks
UNION ALL
SELECT
  id,
  'fulfillment' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN status = 'pending' THEN 'medium' ELSE 'low' END AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM fulfillment_tasks
UNION ALL
SELECT
  id,
  'playbook' AS task_source,
  action_text AS title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN action_type = 'immediate' THEN 'high' ELSE 'medium' END AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM playbook_tasks
UNION ALL
SELECT
  id,
  'client' AS task_source,
  title,
  agency_id,
  created_by AS assigned_to,
  CASE WHEN completed THEN 'done' ELSE 'pending' END AS status,
  'medium' AS priority,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM client_tasks
UNION ALL
SELECT
  id,
  'recurring' AS task_source,
  title,
  agency_id,
  assigned_to,
  status::text,
  CASE WHEN status = 'pending' THEN 'medium' ELSE 'low' END AS priority,
  due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  created_at
FROM recurring_fulfillment_tasks
UNION ALL
SELECT
  ct.id,
  'customer' AS task_source,
  st.title,
  ct.agency_id,
  ct.assigned_to,
  ct.status::text,
  'medium' AS priority,
  NULL::date AS due_date,
  NULL::uuid AS candidate_id,
  NULL::integer AS sla_minutes,
  ct.created_at
FROM customer_tasks ct
JOIN sop_tasks st ON st.id = ct.sop_task_id;

alter table public.fulfillment_tasks drop constraint if exists fulfillment_tasks_task_type_check;
alter table public.fulfillment_tasks add constraint fulfillment_tasks_task_type_check check (task_type = any (array[
  'perspective_funnel', 'ad_copy', 'script', 'meta_campaign', 'other', 'phone_script', 'video_script', 'job_posting',
  'creative_brief', 'meta_upload', 'funnel_publish', 'manual', 'backup_ad_account'
]));
