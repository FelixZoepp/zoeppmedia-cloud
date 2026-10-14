-- Indeed-Budget je Kunde in Phasen: Tagesbudget ab Startdatum, Ende offen = läuft noch.
-- Daraus rechnet die Cloud Kosten und Leadpreis (Kosten ÷ Indeed-Bewerber im selben Zeitraum).
create table if not exists indeed_budget (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  tagesbudget numeric(10,2) not null check (tagesbudget >= 0),
  start date not null,
  ende date,
  angelegt_von uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ende is null or ende >= start)
);
create index if not exists idx_indeed_budget_agency on indeed_budget(agency_id, start);
alter table indeed_budget enable row level security;
drop policy if exists "Kunde liest eigenes Indeed-Budget" on indeed_budget;
create policy "Kunde liest eigenes Indeed-Budget" on indeed_budget for select
  using (agency_id = (select agency_id from users where id = auth.uid()) or public.get_user_role(auth.uid()) in ('admin', 'employee'));
