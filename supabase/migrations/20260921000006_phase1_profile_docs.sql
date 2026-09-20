-- Phase 1: documents, notes.application_id, activity_log.application_id, phone-Unique-Index.
-- ACHTUNG: Vor dem Anwenden MUSS der Orchestrator den Duplikat-Check aus Task 13 ausfuehren!

-- 1. documents-Tabelle (Spec Abschn. 4: Lebenslauf, Anhaenge)
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'upload',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_application ON documents(application_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents select" ON documents FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "documents write" ON documents FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. notes.application_id (NULL fuer Bestands-Notizen)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES applications(id) ON DELETE CASCADE;

-- 3. activity_log.application_id
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS application_id uuid;

-- 4. Partieller Unique-Index fuer Dublettenerkennung (Spec Abschn. 4)
-- Setzt voraus, dass der Orchestrator Duplikate vorher bereinigt hat!
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_agency_phone_e164
  ON candidates(agency_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
