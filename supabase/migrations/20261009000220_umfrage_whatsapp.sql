-- Zufriedenheits-Check per WhatsApp: Versand, Erinnerungen, Schnellbewertung aus dem Chat
alter table public.survey_schedule
  add column if not exists wa_gesendet_am timestamptz,
  add column if not exists erinnert_am timestamptz,
  add column if not exists erinnerungen integer not null default 0,
  add column if not exists schnell_bewertung integer;
