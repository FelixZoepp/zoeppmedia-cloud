-- Kunden dürfen WhatsApp-Konto und Vorlagen nicht direkt per Datenbank ändern (nur über die Server-Routen);
-- lesen dürfen das Konto (inkl. verschlüsselter Token/PIN) nur Zoepp-Mitarbeiter
drop policy if exists "wa_accounts write" on public.whatsapp_accounts;
drop policy if exists "wa_accounts select" on public.whatsapp_accounts;
create policy "wa_accounts select intern" on public.whatsapp_accounts for select using (get_user_role(auth.uid()) = any (array['admin'::user_role, 'employee'::user_role]));
drop policy if exists "wa_templates write" on public.whatsapp_templates;
-- Nachholen von Indeed-Mails: Versuche zählen, nach 5 Versuchen „aufgegeben“
alter table public.inbound_email_log add column if not exists versuche int not null default 0;
alter table public.inbound_email_log drop constraint if exists inbound_email_log_status_check;
alter table public.inbound_email_log add constraint inbound_email_log_status_check check (status in ('processed','failed','no_agency','abruf_fehler','unvollstaendig','kein_job','nachgeholt','aufgegeben'));
