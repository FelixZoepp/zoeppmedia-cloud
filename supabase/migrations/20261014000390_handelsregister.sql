-- Onboarding: Firmensitz + Handelsregisterauszug (Grundlage für die Festnetznummer pro Kunde)
-- dankevideo_url schickte das Formular schon immer mit, die Spalte fehlte → Entwurf und Abschluss schlugen fehl
alter table onboarding_submissions add column if not exists dankevideo_url text;
alter table onboarding_submissions add column if not exists firmen_strasse text;
alter table onboarding_submissions add column if not exists firmen_plz text;
alter table onboarding_submissions add column if not exists firmen_ort text;
alter table onboarding_submissions add column if not exists handelsregister_pfad text;
alter table onboarding_submissions add column if not exists handelsregister_dateiname text;
alter table onboarding_submissions add column if not exists handelsregister_am timestamptz;

-- Privater Speicher für Kundenunterlagen: keine Policies → nur der Server (Service-Rolle) und signierte Links
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kunden-dokumente', 'kunden-dokumente', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
