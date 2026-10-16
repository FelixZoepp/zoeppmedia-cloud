-- Gekaufte Kundennummer auch fürs Telefonieren: als Absender im Twilio-Hauptkonto bestätigen
-- (Twilio ruft die Nummer an, die Cloud tippt den Code selbst ein) + Rückrufe aufs Handy weiterleiten.
alter table kunden_telefonnummern
  add column if not exists weiterleiten_an text,
  add column if not exists anrufer_code text,
  add column if not exists anrufer_code_bis timestamptz,
  add column if not exists anrufer_bestaetigt_am timestamptz;
