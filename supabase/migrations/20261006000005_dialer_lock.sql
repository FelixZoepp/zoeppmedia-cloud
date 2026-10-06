-- Anruf-Modus: Bewerber kurz sperren, solange jemand (Kunde oder Innendienst) ihn anruft,
-- damit niemand dieselbe Person doppelt anruft.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS candidates_locked_until_idx ON candidates (locked_until) WHERE locked_until IS NOT NULL;
