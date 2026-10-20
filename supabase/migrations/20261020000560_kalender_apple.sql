-- Apple/iCloud-Kalender per CalDAV: app-spezifisches Passwort verschlüsselt in refresh_token_enc, Kalender-URL in kalender_id
alter table public.kalender_verbindungen drop constraint if exists kalender_verbindungen_provider_check;
alter table public.kalender_verbindungen add constraint kalender_verbindungen_provider_check check (provider in ('google','microsoft','apple'));
alter table public.kalender_verbindungen add column if not exists caldav_home text;
