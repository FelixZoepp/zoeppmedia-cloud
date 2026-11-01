-- Kunden-Health-Score: täglicher Snapshot je aktivem Kunden (Score 0–100, Stufe, Gründe, Kennzahlen).
-- Berechnung in src/lib/kontrollzentrum/health-score.ts, Aufruf im Tages-Cron (/api/cron/daily).
-- Trend im Kontrollzentrum: heute gegen vor 7 Tagen.
-- Nur Service-Role (RLS an, keine Policies).

create table if not exists public.kunden_health (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  datum date not null,
  score int not null check (score between 0 and 100),
  stufe text not null check (stufe in ('gut', 'beobachten', 'kritisch')),
  gruende jsonb not null default '[]',
  kennzahlen jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (agency_id, datum)
);
create index if not exists kunden_health_datum_idx on public.kunden_health (datum desc);
alter table public.kunden_health enable row level security;
