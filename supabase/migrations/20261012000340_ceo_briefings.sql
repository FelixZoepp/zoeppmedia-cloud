-- CEO-Briefing: eine Ausgabe pro Tag (Dedupe + Ansicht /admin/briefing)
create table if not exists ceo_briefings (
  tag date primary key,
  daten jsonb not null,
  erstellt_am timestamptz not null default now(),
  gesendet_am timestamptz,
  fehler text
);
alter table ceo_briefings enable row level security;
-- Nur Server (Service-Role) liest/schreibt; die Seite lädt serverseitig
