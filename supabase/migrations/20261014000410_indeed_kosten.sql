-- Indeed-Kosten je Kunde aus dem CSV-Export des Indeed-Arbeitgeberkontos (Upload unter /admin/indeed-kosten)
create table if not exists indeed_kosten (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  von date not null,
  bis date not null,
  anzeige text not null,
  standort text not null default '',
  impressionen integer,
  klicks integer,
  bewerbungen integer,
  kosten numeric(12,2) not null default 0,
  importiert_von uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agency_id, von, bis, anzeige, standort),
  check (bis >= von)
);
create index if not exists idx_indeed_kosten_agency on indeed_kosten(agency_id, bis desc);
alter table indeed_kosten enable row level security;
drop policy if exists "Kunde liest eigene Indeed-Kosten" on indeed_kosten;
create policy "Kunde liest eigene Indeed-Kosten" on indeed_kosten for select
  using (agency_id = (select agency_id from users where id = auth.uid()) or public.get_user_role(auth.uid()) in ('admin', 'employee'));

-- Gemerkte Zuordnung Anzeigentitel → Kunde, damit der nächste Import automatisch passt (nur Server)
create table if not exists indeed_anzeigen_zuordnung (
  schluessel text primary key,
  agency_id uuid not null references agencies(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table indeed_anzeigen_zuordnung enable row level security;
