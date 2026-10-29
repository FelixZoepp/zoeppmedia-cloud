-- Brief an die Vertriebsleiter (Funnel-Seite auf der Felix-Zoepp-Website): echte Zähler + Lesen je Lead
create table if not exists public.sales_brief_events (
  id uuid primary key default gen_random_uuid(),
  besucher text not null,                 -- zufällige ID im Browser des Lesers
  art text not null check (art in ('offen', 'ende', 'fragen', 'anfrage')),
  lead_id text,                           -- Close-Lead, wenn über den persönlichen Link (?l=) geöffnet oder angefragt
  quelle text,                            -- utm_source / Kanal
  kampagne text,                          -- utm_campaign
  created_at timestamptz not null default now(),
  unique (besucher, art)
);
create index if not exists sales_brief_events_art_idx on public.sales_brief_events (art, created_at desc);
create index if not exists sales_brief_events_lead_idx on public.sales_brief_events (lead_id) where lead_id is not null;

-- Nur Server (Service-Role); intern lesbar für Auswertungen
alter table public.sales_brief_events enable row level security;
create policy "Intern lesen" on public.sales_brief_events for select to authenticated using (public.is_internal_user());
