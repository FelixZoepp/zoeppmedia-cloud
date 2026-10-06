-- Perspective: externe Kennung gegen doppelte Leads (Webhook). Der zunächst vorbereitete API-Abgleich
-- (system_einstellungen, letzter_abgleich) wird nicht genutzt – Leads kommen per Webhook je Funnel.

-- Systemweite Einstellungen (nur Service-Role, keine Policies → für Nutzer unsichtbar)
CREATE TABLE IF NOT EXISTS system_einstellungen (
  key text PRIMARY KEY,
  wert text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_einstellungen ENABLE ROW LEVEL SECURITY;

-- Zufälliges Token, mit dem der Datenbank-Zeitplan den Abgleich auslöst
INSERT INTO system_einstellungen (key, wert)
VALUES ('sync_token', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Stand des Abgleichs je Funnel
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS letzter_abgleich timestamptz;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS abgleich_fehler text;

-- Externe Kennung (z. B. Perspective-Kontakt-ID), damit nichts doppelt angelegt wird
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS externe_id text;
CREATE UNIQUE INDEX IF NOT EXISTS candidates_agency_externe_id ON candidates (agency_id, externe_id) WHERE externe_id IS NOT NULL;
