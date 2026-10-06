-- Kunden-Team: Einladungen mit Rolle (Inhaber, Mitarbeiter = Innendienst des Kunden, nur lesen)
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'agency_owner'
  CHECK (role IN ('agency_owner', 'agency_member', 'agency_viewer'));
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS name text;
