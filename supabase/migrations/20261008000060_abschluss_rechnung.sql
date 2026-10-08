-- Abschluss → Vertragsbestätigung in der Cloud → Setup-Rechnung (von Hand in Lexware) → Zahlung startet das Onboarding

-- Doppelt-Schutz: ein Formular-Absenden = ein Kunde (erneutes Absenden legt nichts doppelt an)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS abschluss_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agencies_abschluss_key
  ON agencies (abschluss_key)
  WHERE abschluss_key IS NOT NULL;

-- Garantieziel aus dem Abschluss (wurde bisher verworfen)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_ziel_starter integer;

-- Vertragsbestätigung je Kunde (nur Kunden aus dem neuen Ablauf haben eine Zeile)
CREATE TABLE IF NOT EXISTS vertraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  -- Eckdaten aus dem After-Close-Formular, so wie sie der Kunde bestätigt
  daten jsonb NOT NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bestaetigt')),
  unterzeichner_name text,
  bestaetigt_am timestamptz,
  ip text,
  user_agent text,
  daten_hash text,
  agb_url text,
  -- Setup-Rechnung: schreibt die Buchhaltung von Hand in Lexware, die Cloud findet sie selbst
  setup_rechnung_id text,
  setup_rechnung_nummer text,
  setup_rechnung_status text,
  setup_bezahlt_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Nur Service-Role (öffentliche Seite läuft serverseitig über den Token)
ALTER TABLE vertraege ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vertraege_offene_zahlung
  ON vertraege (bestaetigt_am)
  WHERE status = 'bestaetigt' AND setup_bezahlt_am IS NULL;

-- Link auf AGB/Vertragsbedingungen (leer = Hinweistext statt Link)
INSERT INTO system_einstellungen (key, wert)
VALUES ('vertrag_agb_url', '')
ON CONFLICT (key) DO NOTHING;
