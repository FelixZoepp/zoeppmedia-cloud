-- No-show tracking on candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS noshow_points NUMERIC(3,1) DEFAULT 0;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS blacklisted_by UUID REFERENCES users(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS blacklist_expires_at TIMESTAMPTZ;

-- No-show event log
CREATE TABLE noshow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('no_show', 'late_cancel', 'point_override')),
  points NUMERIC(3,1) NOT NULL,
  appointment_type TEXT,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_noshow_events_candidate ON noshow_events(candidate_id);
ALTER TABLE noshow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own noshow events" ON noshow_events FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Agency users insert noshow events" ON noshow_events FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users see all" ON noshow_events FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can manage" ON noshow_events FOR ALL
  USING (true) WITH CHECK (true);
