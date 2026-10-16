-- Termin-Format je Stelle + Vorstellungsrunden (Gruppentermine vor Ort, z. B. „17 Uhr ins Büro“).
-- jobs.termin_format: telefon | video | vor_ort | vorstellungsrunde (null = aus appointment_type abgeleitet).
-- Die Adresse/der Link für Einzelgespräche bleibt in jobs.appointment_location.
-- Kein Backfill: bestehende Stellen behalten ihr Verhalten.

alter table public.jobs add column if not exists termin_format text;
alter table public.jobs drop constraint if exists jobs_termin_format_check;
alter table public.jobs add constraint jobs_termin_format_check
  check (termin_format is null or termin_format in ('telefon', 'video', 'vor_ort', 'vorstellungsrunde'));

-- Feste Termine einer Vorstellungsrunde, vom Kunden angelegt
create table if not exists public.vorstellungsrunden (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  adresse text not null check (length(trim(adresse)) > 0),
  -- z. B. „Klingel Zoepp, 2. OG“
  hinweis text,
  max_teilnehmer integer not null default 10 check (max_teilnehmer between 1 and 500),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vorstellungsrunden_ende_nach_start check (ends_at > starts_at)
);
create index if not exists idx_vorstellungsrunden_job_start on public.vorstellungsrunden(agency_id, job_id, starts_at);

alter table public.vorstellungsrunden enable row level security;

drop policy if exists "vorstellungsrunden select" on public.vorstellungsrunden;
create policy "vorstellungsrunden select" on public.vorstellungsrunden for select
  using (can_access_agency(agency_id));

drop policy if exists "vorstellungsrunden write" on public.vorstellungsrunden;
create policy "vorstellungsrunden write" on public.vorstellungsrunden for all
  using (can_write_agency(agency_id))
  with check (can_write_agency(agency_id));

-- Termin des Bewerbers ↔ Vorstellungsrunde
alter table public.appointments add column if not exists vorstellungsrunde_id uuid
  references public.vorstellungsrunden(id) on delete set null;
create index if not exists idx_appointments_vorstellungsrunde on public.appointments(vorstellungsrunde_id)
  where vorstellungsrunde_id is not null;

-- Doppelbuchungs-Schutz gilt weiter für Einzelgespräche, nicht für Gruppentermine
drop index if exists public.idx_appointments_no_double_book;
create unique index if not exists idx_appointments_no_double_book on public.appointments(agency_id, starts_at)
  where status in ('booked', 'confirmed') and vorstellungsrunde_id is null;

-- Je Bewerbung höchstens eine aktive Buchung pro Runde
create unique index if not exists uq_appointments_runde_bewerbung on public.appointments(vorstellungsrunde_id, application_id)
  where status in ('booked', 'confirmed') and vorstellungsrunde_id is not null;

-- Max. Teilnehmer hart in der Datenbank durchsetzen (auch bei gleichzeitigen Buchungen)
create or replace function public.pruefe_vorstellungsrunde_platz()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max integer;
  v_belegt integer;
begin
  if new.vorstellungsrunde_id is null or new.status not in ('booked', 'confirmed') then
    return new;
  end if;
  -- Bereits gezählte Buchung (z. B. booked → confirmed) nicht erneut prüfen
  if tg_op = 'UPDATE' and old.vorstellungsrunde_id is not distinct from new.vorstellungsrunde_id
     and old.status in ('booked', 'confirmed') then
    return new;
  end if;

  select max_teilnehmer into v_max
    from vorstellungsrunden
   where id = new.vorstellungsrunde_id and agency_id = new.agency_id
   for update;
  if not found then
    raise exception 'Vorstellungsrunde nicht gefunden';
  end if;

  select count(*) into v_belegt
    from appointments
   where vorstellungsrunde_id = new.vorstellungsrunde_id
     and status in ('booked', 'confirmed')
     and id <> new.id;
  if v_belegt >= v_max then
    raise exception 'Vorstellungsrunde ausgebucht';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointments_vorstellungsrunde_platz on public.appointments;
create trigger trg_appointments_vorstellungsrunde_platz
  before insert or update of status, vorstellungsrunde_id on public.appointments
  for each row execute function public.pruefe_vorstellungsrunde_platz();
