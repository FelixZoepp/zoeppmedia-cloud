-- Kundengespräche (Kick-off, Onboarding, Service, Ergebnis) aus Fireflies: je Kunde gespeichert,
-- mit Stimmung, Zusammenfassung, Zusagen und To-dos für den zuständigen Mitarbeiter. Nur der Server schreibt.
create table if not exists kunden_gespraeche (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  fireflies_id text not null unique,
  titel text,
  datum timestamptz,
  dauer_min numeric,
  art text not null default 'sonstiges',
  stimmung text,
  stimmung_score integer,
  zuordnung text,
  auswertung jsonb,
  aufgaben_angelegt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kunden_gespraeche_agency on kunden_gespraeche(agency_id, datum desc);
alter table kunden_gespraeche enable row level security;
drop policy if exists "Intern liest Kundengespräche" on kunden_gespraeche;
create policy "Intern liest Kundengespräche" on kunden_gespraeche for select
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'));

-- Fireflies-Gespräche mit Kunden landen in kunden_gespraeche statt in Close
alter table gespraech_analysen drop constraint if exists gespraech_analysen_status_check;
alter table gespraech_analysen add constraint gespraech_analysen_status_check check (status in ('offen', 'in_close', 'kein_lead', 'fehler', 'uebersprungen', 'kunde'));
