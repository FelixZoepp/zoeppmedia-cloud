-- Tageskennzahlen Marketing + Sales (Abendbericht 20 Uhr, ersetzt Make → Monday)
create table if not exists public.kennzahlen_tage (
  tag date not null,
  bereich text not null check (bereich in ('marketing', 'sales')),
  werte jsonb not null default '{}'::jsonb,
  aktualisiert_am timestamptz not null default now(),
  primary key (tag, bereich)
);
alter table public.kennzahlen_tage enable row level security;
-- Nur serverseitig (Service-Role) – keine Policies
