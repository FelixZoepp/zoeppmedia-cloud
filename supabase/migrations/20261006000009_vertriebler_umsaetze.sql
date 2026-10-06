-- Umsatz/Provision eingestellter Vertriebler je Monat (vom Kunden einzutragen) → ROI und Umsatzwachstum
CREATE TABLE IF NOT EXISTS vertriebler_umsaetze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  monat date NOT NULL CHECK (extract(day FROM monat) = 1),
  umsatz numeric(12,2) NOT NULL DEFAULT 0 CHECK (umsatz >= 0),
  provision numeric(12,2) CHECK (provision IS NULL OR provision >= 0),
  aktiv boolean NOT NULL DEFAULT true,
  notiz text,
  eingetragen_von uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, monat)
);
CREATE INDEX IF NOT EXISTS vertriebler_umsaetze_agency_monat ON vertriebler_umsaetze (agency_id, monat DESC);

ALTER TABLE vertriebler_umsaetze ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Umsätze lesen" ON vertriebler_umsaetze;
CREATE POLICY "Umsätze lesen" ON vertriebler_umsaetze FOR SELECT TO authenticated USING (public.can_access_agency(agency_id));
DROP POLICY IF EXISTS "Umsätze schreiben" ON vertriebler_umsaetze;
CREATE POLICY "Umsätze schreiben" ON vertriebler_umsaetze FOR ALL TO authenticated
  USING (public.can_write_agency(agency_id)) WITH CHECK (public.can_write_agency(agency_id));
