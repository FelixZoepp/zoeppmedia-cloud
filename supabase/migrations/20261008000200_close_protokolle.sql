-- Gesprächsprotokolle aus Close (Terminierung, Setting, Closing, Follow-up) + ausgeführte Automatik
create table if not exists public.close_protokolle (
  id text primary key,
  typ text not null check (typ in ('terminierung', 'setting', 'closing', 'follow_up')),
  lead_id text,
  user_id text,
  datum timestamptz not null,
  felder jsonb not null default '{}'::jsonb,
  aktionen jsonb,
  ausgefuehrt_am timestamptz,
  aktualisiert_am timestamptz not null default now()
);
create index if not exists idx_close_protokolle_datum on public.close_protokolle (datum);
create index if not exists idx_close_protokolle_lead on public.close_protokolle (lead_id);
alter table public.close_protokolle enable row level security;
