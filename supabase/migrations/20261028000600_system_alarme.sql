-- System-Wächter: offene Betriebsalarme (gedrosselt nach Slack, „wieder OK“-Meldung beim Schließen)
create table if not exists public.system_alarme (
  schluessel text primary key,
  titel text not null,
  text text,
  schwere text not null default 'warnung' check (schwere in ('kritisch', 'warnung')),
  offen boolean not null default true,
  anzahl integer not null default 1,
  erstes_am timestamptz not null default now(),
  zuletzt_am timestamptz not null default now(),
  zuletzt_gemeldet_am timestamptz,
  behoben_am timestamptz
);

-- Nur Service-Role (keine Policies)
alter table public.system_alarme enable row level security;
