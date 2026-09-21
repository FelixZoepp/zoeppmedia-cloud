-- Phase 1 Abnahme-Fix: candidates_source_check erlaubte nur ('meta','indeed','manual'),
-- Phase 1 schreibt aber auch 'form' (/apply) und 'csv' (CSV-Import).
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_source_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_source_check
  CHECK (source = ANY (ARRAY['meta'::text, 'indeed'::text, 'manual'::text, 'form'::text, 'csv'::text]));
