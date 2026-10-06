-- Wochenberichte an Kunden: ein Bericht pro Kunde und Kalenderwoche (Status „auf Kurs“ usw.)
CREATE TABLE IF NOT EXISTS wochenberichte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  jahr int NOT NULL,
  kw int NOT NULL,
  status text NOT NULL CHECK (status IN ('auf_kurs', 'achtung', 'kritisch')),
  daten jsonb NOT NULL,
  empfaenger text[] NOT NULL DEFAULT '{}',
  gesendet_am timestamptz,
  fehler text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, jahr, kw)
);
CREATE INDEX IF NOT EXISTS idx_wochenberichte_agency ON wochenberichte(agency_id, jahr DESC, kw DESC);

ALTER TABLE wochenberichte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wochenberichte lesen" ON wochenberichte FOR SELECT TO authenticated USING (public.can_access_agency(agency_id));
-- Schreiben nur serverseitig (Service-Role)
