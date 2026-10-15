-- Zeiterfassung intern: Arbeitsstunden je Mitarbeiter und Kunde (Stoppuhr oder nachgetragen),
-- Grundlage für die Marge je Kunde (Stunden × interner Stundensatz). agency_id null = intern, kein Kunde.
create table if not exists zeiteintraege (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  agency_id uuid references agencies(id) on delete set null,
  taetigkeit text not null default 'sonstiges'
    check (taetigkeit in ('anrufe', 'onboarding', 'kampagne', 'funnel', 'support', 'sales', 'intern', 'sonstiges')),
  start timestamptz not null,
  ende timestamptz,
  -- Dauer in Minuten, rechnet die Datenbank beim Stoppen selbst (laufende Stoppuhr = null)
  minuten integer generated always as (
    case when ende is null then null else floor(extract(epoch from (ende - start)) / 60)::integer end
  ) stored,
  notiz text,
  created_at timestamptz not null default now(),
  constraint zeiteintraege_ende_nach_start check (ende is null or ende >= start)
);
create index if not exists idx_zeiteintraege_user_start on zeiteintraege(user_id, start desc);
create index if not exists idx_zeiteintraege_start on zeiteintraege(start);
create index if not exists idx_zeiteintraege_agency_start on zeiteintraege(agency_id, start);
-- Höchstens eine laufende Stoppuhr je Mitarbeiter
create unique index if not exists uq_zeiteintraege_laufend on zeiteintraege(user_id) where ende is null;

alter table zeiteintraege enable row level security;

drop policy if exists "Eigene Zeiten lesen" on zeiteintraege;
create policy "Eigene Zeiten lesen" on zeiteintraege for select
  using (user_id = auth.uid() or public.get_user_role(auth.uid()) = 'admin');

drop policy if exists "Eigene Zeiten anlegen" on zeiteintraege;
create policy "Eigene Zeiten anlegen" on zeiteintraege for insert
  with check (
    (user_id = auth.uid() and public.get_user_role(auth.uid()) in ('admin', 'employee'))
    or public.get_user_role(auth.uid()) = 'admin'
  );

drop policy if exists "Eigene Zeiten ändern" on zeiteintraege;
create policy "Eigene Zeiten ändern" on zeiteintraege for update
  using (user_id = auth.uid() or public.get_user_role(auth.uid()) = 'admin')
  with check (user_id = auth.uid() or public.get_user_role(auth.uid()) = 'admin');

drop policy if exists "Eigene Zeiten löschen" on zeiteintraege;
create policy "Eigene Zeiten löschen" on zeiteintraege for delete
  using (user_id = auth.uid() or public.get_user_role(auth.uid()) = 'admin');

-- Interner Stundensatz (€/h) für die Kosten je Kunde, im Admin unter /admin/zeiten änderbar
insert into system_einstellungen (key, wert) values ('stundensatz_intern', '35')
on conflict (key) do nothing;
