-- Sales-WhatsApp: Kontakt gehört zu einem Kunden (Inbox-Tab „Kunden“, Erinnerungen per WhatsApp)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS kunde_agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_kunde_agency ON candidates(kunde_agency_id) WHERE kunde_agency_id IS NOT NULL;
