-- Zoepp-Assistent per WhatsApp (nur die Nummern aus system_einstellungen.ceo_briefing):
-- kurzer Gesprächsverlauf je Nummer (nur Text, wird nach 3 Std. Pause neu begonnen)
create table if not exists assistent_whatsapp_verlauf (
  telefon text primary key,
  verlauf jsonb not null default '[]'::jsonb,
  aktualisiert_am timestamptz not null default now()
);
alter table assistent_whatsapp_verlauf enable row level security;
-- Nur der Server (Service-Rolle) liest und schreibt: keine Policies
