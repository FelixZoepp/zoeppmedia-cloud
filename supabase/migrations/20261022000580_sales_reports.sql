-- Report-Funnel (Freebie per Perspective): eigene Strecke neben den normalen Funnel-Eintragungen.
-- Je Download eine Zeile: Slack an Felix, WhatsApp mit PDF-Link, 10-Min-Check, erster Anruf, Buchung.
create table if not exists sales_report_downloads (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null,
  report text not null,
  name text,
  email text,
  phone text,
  neuer_lead boolean not null default true,
  eingetragen_am timestamptz not null default now(),
  slack_am timestamptz,
  whatsapp_am timestamptz,
  whatsapp_status text,
  geoeffnet_am timestamptz,
  aufgabe_am timestamptz,
  erster_anruf_am timestamptz,
  gebucht_am timestamptz,
  ergebnis text not null default 'offen' check (ergebnis in ('offen', 'direkt_gebucht', 'nicht_gebucht', 'spaeter_gebucht')),
  created_at timestamptz not null default now()
);
create index if not exists idx_report_downloads_zeit on sales_report_downloads(eingetragen_am desc);
create index if not exists idx_report_downloads_lead on sales_report_downloads(lead_id);

-- Nur der Server (Service-Rolle) greift zu
alter table sales_report_downloads enable row level security;

-- PDFs privat, ausgeliefert über /api/report/<token> (signierter Link je Lead)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sales-reports', 'sales-reports', false, 31457280, array['application/pdf'])
on conflict (id) do nothing;
