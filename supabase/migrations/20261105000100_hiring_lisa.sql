-- Hiring Lisa (eigenständiges Produkt) an die Cloud anbinden – je Kunde.
-- Ablauf: Kunde fragt im Portal an (status 'angefragt') → Felix bespricht das Paket → trägt Lisa-Schlüssel ein ('eingerichtet')
-- → schaltet frei ('aktiv'). Erst dann gehen neue Bewerbungen an Lisa, und Lisa meldet Anrufe, Status und Termine zurück.
create table if not exists public.lisa_verbindungen (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  status text not null default 'angefragt' check (status in ('angefragt', 'eingerichtet', 'aktiv', 'pausiert')),
  basis_url text,                          -- null = Standard-Lisa-URL
  api_key_enc text,                        -- lisa_in_… (Bewerbungs-Eingang), verschlüsselt
  webhook_secret_enc text,                 -- lisa_whsec_… (Rückmeldungen), verschlüsselt
  einwilligung_text text,                  -- Einwilligung „Anruf durch digitalen Assistenten“, wie sie im Bewerbungsformular des Kunden steht
  einwilligung_version text,
  angefragt_am timestamptz,
  angefragt_von uuid,                      -- users.id, bewusst ohne Fremdschlüssel (sonst mehrdeutige Embeds agencies ↔ users)
  anfrage_notiz text,
  aktiviert_am timestamptz,
  letzter_versand_am timestamptz,
  letztes_ereignis_am timestamptz,
  letzter_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Nur Server (Service-Role); Kunden sehen ihren Stand über die API
alter table public.lisa_verbindungen enable row level security;

-- Zuordnung zu Lisa (keine Fremdschlüssel → keine mehrdeutigen Embeds)
alter table public.applications add column if not exists lisa_applicant_id text;
alter table public.applications add column if not exists lisa_gesendet_am timestamptz;
alter table public.candidate_appointments add column if not exists lisa_appointment_id text;
create unique index if not exists candidate_appointments_lisa_id on public.candidate_appointments (lisa_appointment_id) where lisa_appointment_id is not null;
-- Wer hat angerufen: null = Mensch (user_id), 'lisa' = KI-Anruf von Hiring Lisa
alter table public.call_logs add column if not exists quelle text;
