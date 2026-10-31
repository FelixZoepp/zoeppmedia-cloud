-- Zweiter Boden für Manatal-Bewerber (ohne Indeed-Mail): jede Manatal-Stelle wird einmal von einem Admin für genau
-- einen Kunden bestätigt (im Indeed-Konto des Kunden abgeglichen). Erst dann laufen ihre Bewerber automatisch durch.
create table if not exists public.manatal_stellen (
  manatal_job_id bigint primary key,
  manatal_organisation bigint,
  stellentitel text,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  bestaetigt_von uuid references public.users(id) on delete set null,
  bestaetigt_am timestamptz not null default now()
);
alter table public.manatal_stellen enable row level security;
