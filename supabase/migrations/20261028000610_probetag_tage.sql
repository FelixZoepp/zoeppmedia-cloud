-- Probetag-Format je Kunde: 1 Tag, 3 Tage hintereinander oder Probewoche (5 Tage).
-- Abfrage im Onboarding, wirksam über agencies.settings.probetag_tage.
alter table public.onboarding_submissions add column if not exists probetag_tage smallint check (probetag_tage in (1, 3, 5));

-- Hendrik Hoffmann: 3 Probetage hintereinander (Standard laut Felix, 28.10.2026)
update public.agencies set settings = coalesce(settings, '{}'::jsonb) || '{"probetag_tage": 3}'::jsonb where id = 'ea03bdce-b1f8-4412-ace9-36e38f738db9';
