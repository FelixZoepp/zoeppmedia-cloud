-- DSGVO Consent Tracking
-- Tracks opt-in/opt-out events per candidate and channel

CREATE TABLE consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms', 'phone_recording')),
  event_type TEXT NOT NULL CHECK (event_type IN ('opt_in', 'opt_out', 'recording_consent', 'recording_decline')),
  source TEXT NOT NULL CHECK (source IN ('funnel_form', 'whatsapp_reply', 'manual', 'bot', 'call')),
  evidence TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_events_candidate ON consent_events(candidate_id);
CREATE INDEX idx_consent_events_agency ON consent_events(agency_id);

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own consent events" ON consent_events FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Agency users insert consent events" ON consent_events FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users see all consent events" ON consent_events FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can manage consent events" ON consent_events FOR ALL
  USING (true) WITH CHECK (true);

-- Add consent summary fields to candidates for quick lookups
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT true;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recording_consent BOOLEAN;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false;
