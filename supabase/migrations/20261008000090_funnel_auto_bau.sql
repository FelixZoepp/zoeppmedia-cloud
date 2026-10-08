-- Funnel automatisch über Perspective bauen (Vorlage duplizieren → Texte per KI → veröffentlichen)
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS vorlage_funnel_id text;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS inhalt_id uuid REFERENCES fulfillment_inhalte(id) ON DELETE SET NULL;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS bau_status text;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS bau_job_id text;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS bau_fehler text;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS editor_url text;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS auto_veroeffentlichen boolean NOT NULL DEFAULT true;
ALTER TABLE perspective_funnels ADD COLUMN IF NOT EXISTS bau_gestartet_am timestamptz;

ALTER TABLE perspective_funnels DROP CONSTRAINT IF EXISTS perspective_funnels_bau_status_check;
ALTER TABLE perspective_funnels ADD CONSTRAINT perspective_funnels_bau_status_check
  CHECK (bau_status IS NULL OR bau_status IN ('gestartet', 'dupliziert', 'texte_in_arbeit', 'texte_fertig', 'veroeffentlicht', 'fehler'));

-- Höchstens ein laufender Bau je Kunde (Doppelklick/gleichzeitiger Start)
CREATE UNIQUE INDEX IF NOT EXISTS uq_perspective_funnels_aktiver_bau
  ON perspective_funnels (agency_id)
  WHERE bau_status IN ('gestartet', 'dupliziert', 'texte_in_arbeit', 'texte_fertig');

-- Webhook ordnet Leads über die Perspective-Funnel-ID zu
CREATE INDEX IF NOT EXISTS idx_perspective_funnels_perspective_id
  ON perspective_funnels (perspective_funnel_id) WHERE perspective_funnel_id IS NOT NULL;
