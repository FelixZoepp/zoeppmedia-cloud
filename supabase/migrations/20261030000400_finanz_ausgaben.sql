-- Cash-Plan: Ausgaben (Kartenumsätze, z. B. Amex) und feste Kosten (Mitarbeiter …) – segmentiert nach Kategorie
create table if not exists public.finanz_ausgaben (
  id uuid primary key default gen_random_uuid(),
  schluessel text not null unique,          -- Quelle|Datum|Händler|Betrag|Nr. – verhindert doppelten Import
  datum date not null,                      -- Umsatzdatum
  haendler text not null,
  betrag numeric(12,2) not null,            -- Gutschriften negativ
  kategorie text not null,
  privat boolean not null default false,    -- zählt nicht in die Firmenkosten
  quelle text not null default 'amex',      -- amex | manuell
  beleg text,                               -- z. B. Abrechnung 2026-10-23
  created_at timestamptz not null default now()
);
create index if not exists finanz_ausgaben_datum_idx on public.finanz_ausgaben (datum);
alter table public.finanz_ausgaben enable row level security;

create table if not exists public.finanz_fixkosten (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kategorie text not null,
  monatlich numeric(12,2) not null,
  ab date not null,
  bis date,                                 -- null = laufend
  notiz text,
  created_at timestamptz not null default now()
);
alter table public.finanz_fixkosten enable row level security;
