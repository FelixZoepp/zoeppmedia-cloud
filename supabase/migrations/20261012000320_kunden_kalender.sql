-- Kalender des Kunden (Google / Microsoft 365) per OAuth verbinden: freie Zeiten lesen, Termine eintragen
create table if not exists public.kalender_verbindungen (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  konto_email text,
  kalender_id text not null default 'primary',
  refresh_token_enc text not null,
  access_token_enc text,
  access_bis timestamptz,
  aktiv boolean not null default true,
  fehler text,
  verbunden_von uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists kalender_verbindungen_aktiv_je_kunde on public.kalender_verbindungen(agency_id) where aktiv;
alter table public.kalender_verbindungen enable row level security;
alter table public.candidate_appointments add column if not exists kalender_event_id text, add column if not exists kalender_provider text;
alter table public.appointments add column if not exists kalender_event_id text, add column if not exists kalender_provider text;
