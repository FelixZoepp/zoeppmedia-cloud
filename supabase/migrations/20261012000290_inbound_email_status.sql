-- Indeed-Mail-Eingang: Abruf-Fehler, unvollständige Bewerbungen, fehlende Stelle, nachgeholt
alter table public.inbound_email_log drop constraint if exists inbound_email_log_status_check;
alter table public.inbound_email_log add constraint inbound_email_log_status_check check (status in ('processed','failed','no_agency','abruf_fehler','unvollstaendig','kein_job','nachgeholt'));
