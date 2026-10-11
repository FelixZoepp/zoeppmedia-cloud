-- Kunden-WhatsApp: Firmenname, eigene PIN je Nummer, Fehlergrund, Status „einrichtung“ (noch nicht voll verbunden)
alter table public.whatsapp_accounts add column if not exists verified_name text, add column if not exists pin_enc text, add column if not exists fehler text, add column if not exists geprueft_am timestamptz;
alter table public.whatsapp_accounts drop constraint if exists whatsapp_accounts_status_check;
alter table public.whatsapp_accounts add constraint whatsapp_accounts_status_check check (status in ('connected','disconnected','banned','einrichtung'));
