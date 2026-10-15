-- Eigene Festnetznummer je Kunde für WhatsApp (Twilio-Unterkonto + Nummer + Bestätigungscode von Meta)
-- Alles startet nur per Admin-Klick in der Kundenakte (Freigabe whatsapp_nummer_besorgen).
-- Zugangsdaten der Unterkonten werden NICHT gespeichert – der Server holt sie bei Bedarf mit dem Hauptkonto.
-- Nur der Server (Service-Rolle) liest und schreibt: RLS an, keine Policies.

create table if not exists kunden_telefonnummern (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null unique references agencies(id) on delete cascade,
  twilio_subaccount_sid text unique,
  phone_number_sid text unique,
  nummer_e164 text unique,
  bundle_sid text,
  address_sid text,
  status text not null default 'unterkonto' check (status in ('unterkonto', 'gekauft')),
  -- Nur in diesem Zeitfenster nimmt die Nummer Anrufe/SMS zur Code-Erfassung an
  code_empfang_bis timestamptz,
  angelegt_von uuid references users(id) on delete set null,
  gekauft_von uuid references users(id) on delete set null,
  gekauft_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table kunden_telefonnummern enable row level security;

-- Eingegangene Bestätigungscodes (Anruf-Transkript oder SMS-Text)
create table if not exists nummer_codes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade,
  nummer text not null,
  art text not null check (art in ('anruf', 'sms')),
  text text,
  code text,
  created_at timestamptz not null default now()
);
create index if not exists idx_nummer_codes_nummer on nummer_codes(nummer, created_at desc);
create index if not exists idx_nummer_codes_agency on nummer_codes(agency_id, created_at desc);
alter table nummer_codes enable row level security;
