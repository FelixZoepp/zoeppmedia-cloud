-- Automatische Erinnerungen an Kunden bei offenen Aufgaben (höchstens alle 2 Tage, max. 3 je Schritt)
ALTER TABLE client_steps ADD COLUMN IF NOT EXISTS kunde_erinnert_am timestamptz;
ALTER TABLE client_steps ADD COLUMN IF NOT EXISTS kunde_erinnerungen int NOT NULL DEFAULT 0;
