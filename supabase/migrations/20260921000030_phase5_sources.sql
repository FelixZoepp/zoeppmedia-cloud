-- Phase 5: Quellen (Indeed, Meta, generisch) — Spec §5/§6/§13

-- 1. lead_sources: konfigurierte Eingangsquellen je Mandant (Service-Role-only, wie events_inbox)
CREATE TABLE IF NOT EXISTS lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('meta','generic')),
  name text NOT NULL,
  secret text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_sources_agency ON lead_sources(agency_id);
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

-- 2. Feed-Key je Agentur (geheimer ?key= für den Indeed-XML-Feed)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS indeed_feed_key text;
UPDATE agencies SET indeed_feed_key = encode(extensions.gen_random_bytes(24), 'hex') WHERE indeed_feed_key IS NULL;
ALTER TABLE agencies ALTER COLUMN indeed_feed_key SET NOT NULL;

-- 3. Feed-Abruf-Protokoll fürs Monitoring (Spec §5 Monitoring)
CREATE TABLE IF NOT EXISTS feed_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  polled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feed_polls_agency_time ON feed_polls(agency_id, polled_at);
ALTER TABLE feed_polls ENABLE ROW LEVEL SECURITY;

-- 4. Privater Bucket für Lebensläufe aus Indeed Apply
INSERT INTO storage.buckets (id, name, public) VALUES ('recruiting-documents', 'recruiting-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Audit-Log-Constraints erweitern (ungültige Webhook-Signatur → Audit-Eintrag, Spec §5)
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN ('candidate','agency','user','automation','template','pipeline_stage','consent','recording','settings','webhook'));
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN ('create','update','delete','access','impersonate','reject'));
