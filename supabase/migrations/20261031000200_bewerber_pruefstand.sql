-- Doppelter Boden für die Bewerber-Zuordnung:
--  * bewerber_pruefstand: Bewerber, deren Kunde nicht doppelt belegt ist, gehen NICHT an den Kunden,
--    sondern warten hier auf Beleg (automatisch) oder Freigabe/Verwerfen durch einen Admin.
--  * indeed_belege: Indeed-Benachrichtigungen, die aus dem Indeed-Konto eines Kunden an
--    bewerber+<kunde>@… weitergeleitet wurden – unabhängiger Beleg für Manatal-Bewerber.
--  * applications.zuordnung_nachweis: woraus die Zuordnung belegt ist (Quellen, Prüfungen, Freigabe).
-- Nur Service-Role (RLS an, keine Policies).

create table if not exists public.bewerber_pruefstand (
  id uuid primary key default gen_random_uuid(),
  quelle text not null check (quelle in ('manatal', 'perspective', 'meta', 'indeed_mail')),
  externe_ref text not null unique,                -- z. B. manatal:<match-id>, perspective:<kontakt-id>
  agency_vorschlag uuid references public.agencies(id) on delete set null,
  name text,
  daten jsonb not null default '{}',                -- alles, was zum Anlegen nötig ist
  gruende text[] not null default '{}',
  status text not null default 'wartet' check (status in ('wartet', 'offen', 'freigegeben', 'verworfen')),
  versuche int not null default 0,
  naechster_versuch timestamptz not null default now(),
  gemeldet_am timestamptz,
  entschieden_von uuid references public.users(id) on delete set null,
  entschieden_am timestamptz,
  ergebnis_agency_id uuid references public.agencies(id) on delete set null,
  ergebnis_candidate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bewerber_pruefstand_status_idx on public.bewerber_pruefstand (status, naechster_versuch);
alter table public.bewerber_pruefstand enable row level security;

create table if not exists public.indeed_belege (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name_norm text,
  email text,
  phone_e164 text,
  stellentitel text,
  email_id text,
  empfangen_am timestamptz not null default now()
);
create index if not exists indeed_belege_agency_idx on public.indeed_belege (agency_id, empfangen_am desc);
create index if not exists indeed_belege_name_idx on public.indeed_belege (name_norm);
alter table public.indeed_belege enable row level security;

alter table public.applications add column if not exists zuordnung_nachweis jsonb;
