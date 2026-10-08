-- Kunden-Abgleich Cloud → Close (Kunde / Ex-Kunde / Upsell-Potenzial)
create table if not exists public.kunden_close_sync (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  lead_id text,
  ex_kunde boolean not null default false,
  upsell boolean not null default false,
  upsell_empfehlung text,
  grund text,
  aktualisiert_am timestamptz not null default now()
);
alter table public.kunden_close_sync enable row level security;
