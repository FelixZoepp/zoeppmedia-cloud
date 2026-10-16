-- Echte Werbekosten je Stellenanzeige:
-- 1. Meta-Kosten je Kampagne und Tag aus dem Werbekonto des Kunden (agencies.meta_ad_account_id),
--    täglicher Abgleich der letzten 7 Tage. Alle Kampagnen eines Werbekontos gehören zu diesem Kunden.
-- 2. Zuordnung Kampagne → Stelle: automatisch über utm_campaign der Funnel-Leads oder manuell
-- 3. Indeed-Budget optional je Stelle (job_id leer = ganzer Kunde wie bisher)

create table if not exists meta_kampagnen_kosten (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  campaign_id text not null,
  campaign_name text,
  datum date not null,
  spend numeric(12,2) not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,
  fetched_at timestamptz not null default now(),
  unique (campaign_id, datum)
);
create index if not exists idx_meta_kampagnen_kosten_agency on meta_kampagnen_kosten(agency_id, datum desc);

alter table meta_kampagnen_kosten enable row level security;
drop policy if exists "Kampagnen-Kosten lesen" on meta_kampagnen_kosten;
create policy "Kampagnen-Kosten lesen" on meta_kampagnen_kosten for select
  using (public.can_access_agency(agency_id));
drop policy if exists "Kampagnen-Kosten intern schreiben" on meta_kampagnen_kosten;
create policy "Kampagnen-Kosten intern schreiben" on meta_kampagnen_kosten for all
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'))
  with check (public.get_user_role(auth.uid()) in ('admin', 'employee'));

-- Kampagne → Stelle (agency_id mitgeführt für Prüfung und RLS)
create table if not exists meta_kampagnen_zuordnung (
  campaign_id text primary key,
  agency_id uuid not null references agencies(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  quelle text not null default 'manuell' check (quelle in ('auto', 'manuell')),
  campaign_name text,
  geaendert_von uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_meta_kampagnen_zuordnung_job on meta_kampagnen_zuordnung(agency_id, job_id);

alter table meta_kampagnen_zuordnung enable row level security;
drop policy if exists "Kampagnen-Zuordnung lesen" on meta_kampagnen_zuordnung;
create policy "Kampagnen-Zuordnung lesen" on meta_kampagnen_zuordnung for select
  using (public.can_access_agency(agency_id));
drop policy if exists "Kampagnen-Zuordnung intern schreiben" on meta_kampagnen_zuordnung;
create policy "Kampagnen-Zuordnung intern schreiben" on meta_kampagnen_zuordnung for all
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'))
  with check (public.get_user_role(auth.uid()) in ('admin', 'employee'));

-- Funnel-Leads: Kampagne/Anzeigengruppe stehen in candidates.meta_campaign / meta_adset
create index if not exists idx_candidates_meta_campaign on candidates(agency_id, meta_campaign) where meta_campaign is not null;

-- Indeed-Budget je Stelle (leer = ganzer Kunde)
alter table indeed_budget add column if not exists job_id uuid references jobs(id) on delete set null;
create index if not exists idx_indeed_budget_job on indeed_budget(job_id) where job_id is not null;
drop policy if exists "Indeed-Budget intern schreiben" on indeed_budget;
create policy "Indeed-Budget intern schreiben" on indeed_budget for all
  using (public.get_user_role(auth.uid()) in ('admin', 'employee'))
  with check (public.get_user_role(auth.uid()) in ('admin', 'employee'));
