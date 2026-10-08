-- Garantie-Ampel und Verlängerungs-Erinnerung (Review 2026-10-08)
-- Ziel steht in agencies.garantie_ziel_starter (kommt aus dem After-Close-Formular, Migration 20261008000060).
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_ziel_starter integer;

-- Zuletzt berechneter Stand – Ampel wird täglich neu berechnet, Alarm nur beim Wechsel der Stufe
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_ampel text
  CHECK (garantie_ampel IS NULL OR garantie_ampel IN ('offen', 'anlauf', 'gruen', 'gelb', 'rot', 'erreicht'));
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_ist integer;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_berechnet_am timestamptz;

-- Bereits erinnerte Fristen vor Laufzeitende (z. B. {30,14}).
-- NULL = noch nie geprüft: beim ersten Lauf werden schon verstrichene Fristen ohne Aufgabe vermerkt.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS verlaengerung_erinnert integer[];
