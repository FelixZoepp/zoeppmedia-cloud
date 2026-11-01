-- Einstellungs-Feier: Sobald ein Bewerber bei einem Kunden eingestellt wird (Stufe vom Typ „hired“
-- oder eingestellt_am gesetzt – egal über welchen Weg: Profil, Kanban, Mehrfachauswahl, Import),
-- plant ein Trigger genau einmal je Bewerber den Job recruiting.einstellung_feier.
-- Der Job postet intern nach Slack (#wins, sonst #fulfillment) und legt eine Zeile in einstellung_feiern an,
-- aus der die Cloud die Konfetti-Animation zeigt. Rein intern – an Bewerber geht nichts.

create table if not exists public.einstellung_feiern (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates(id) on delete cascade,
  -- bewusst ohne FK auf agencies: sonst sähe PostgREST candidates↔agencies als Many-to-Many (mehrdeutige Embeds)
  agency_id uuid not null,
  kunde text,
  vorname text,
  stelle text,
  nr_kunde int,
  nr_monat int,
  slack_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists einstellung_feiern_agency_idx on public.einstellung_feiern (agency_id, created_at desc);
alter table public.einstellung_feiern enable row level security;

create or replace function public.plane_einstellung_feier() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  neu_hired boolean := false;
  alt_hired boolean := false;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if new.current_stage_id is not null then
    select stage_type = 'hired' into neu_hired from pipeline_stages where id = new.current_stage_id;
  end if;
  if tg_op = 'UPDATE' and old.current_stage_id is not null then
    select stage_type = 'hired' into alt_hired from pipeline_stages where id = old.current_stage_id;
  end if;
  if (coalesce(neu_hired, false) and not coalesce(alt_hired, false))
     or (new.eingestellt_am is not null and (tg_op = 'INSERT' or old.eingestellt_am is null)) then
    insert into scheduled_jobs (agency_id, type, run_at, payload, status, dedupe_key)
    values (new.agency_id, 'recruiting.einstellung_feier', now(), jsonb_build_object('candidate_id', new.id), 'pending', 'einstellung_feier:' || new.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_plane_einstellung_feier on public.candidates;
create trigger trg_plane_einstellung_feier
  after insert or update of current_stage_id, eingestellt_am on public.candidates
  for each row execute function public.plane_einstellung_feier();

revoke execute on function public.plane_einstellung_feier() from public, anon, authenticated;
