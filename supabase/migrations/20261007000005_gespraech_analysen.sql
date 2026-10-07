-- Fireflies-Gespräche: Analyse (Zusammenfassung, Bewertung, Fehler) → Notiz am Close-Lead
CREATE TABLE IF NOT EXISTS gespraech_analysen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_id text NOT NULL UNIQUE,
  titel text,
  datum timestamptz,
  dauer_min numeric,
  close_lead_id text,
  zuordnung text,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'in_close', 'kein_lead', 'fehler', 'uebersprungen')),
  punkte int,
  ergebnis jsonb,
  fehler text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gespraech_analysen_datum ON gespraech_analysen(datum DESC);
ALTER TABLE gespraech_analysen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gespraeche intern lesen" ON gespraech_analysen FOR SELECT TO authenticated USING (public.is_internal_user());
