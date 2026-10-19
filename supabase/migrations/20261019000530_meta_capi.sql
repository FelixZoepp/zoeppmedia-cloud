-- Meta Conversions API: jedes an Meta gemeldete Ereignis (Lead, QualifiedLead, Purchase) einmal je event_id.
-- Speichert nur gehashte Kontaktdaten + fbc (Klick-ID) – Klartext bleibt in Close.
-- Nur der Server (Service-Rolle) liest und schreibt: RLS an, keine Policies.

create table if not exists meta_capi_events (
  event_id text primary key,
  event_name text not null,
  close_lead_id text,
  opp_id text,
  fbc text,
  wert numeric,
  test boolean not null default false,
  status text not null default 'geplant' check (status in ('geplant', 'gesendet', 'fehler', 'uebersprungen')),
  user_data jsonb,
  antwort jsonb,
  created_at timestamptz not null default now(),
  gesendet_am timestamptz
);
create index if not exists idx_meta_capi_events_lead on meta_capi_events(close_lead_id, created_at desc);
alter table meta_capi_events enable row level security;
