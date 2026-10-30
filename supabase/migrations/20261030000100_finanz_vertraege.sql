-- Cash-Plan (Admin → Finanzen → Cash-Plan): Kundenverträge mit Monatsgebühr, Setup und Laufzeit
create table if not exists public.finanz_vertraege (
  id uuid primary key default gen_random_uuid(),
  kunde text not null,
  monatlich numeric(12,2) not null default 0,
  setup numeric(12,2) not null default 0,
  setup_monat date,                          -- null = Startmonat
  start date not null,                       -- erster abgerechneter Monat
  laufzeit_monate integer check (laufzeit_monate is null or laufzeit_monate > 0), -- null = unbefristet
  verlaengerung_monatlich numeric(12,2),     -- erwartete Gebühr nach Laufzeitende; null = endet
  ust_satz numeric(5,2) not null default 19,
  rechnungstag integer check (rechnungstag is null or rechnungstag between 1 and 31),
  status text not null default 'aktiv' check (status in ('aktiv', 'startet', 'beendet')),
  angebot text,                              -- z. B. AG0214
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finanz_vertraege_start_idx on public.finanz_vertraege (start);

-- Nur Server (Service-Role) – Zugriff ausschließlich über die Admin-API
alter table public.finanz_vertraege enable row level security;
