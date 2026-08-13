-- Calendly integration
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS calendly_link TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS calendly_link TEXT;

CREATE TABLE IF NOT EXISTS calendly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  calendly_event_id TEXT UNIQUE,
  event_type TEXT,
  event_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  invitee_name TEXT,
  invitee_email TEXT,
  invitee_phone TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendly_events_agency ON calendly_events(agency_id);
CREATE INDEX idx_calendly_events_candidate ON calendly_events(candidate_id);
CREATE INDEX idx_calendly_events_start ON calendly_events(start_time);

ALTER TABLE calendly_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage calendly events" ON calendly_events FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Agency can read own events" ON calendly_events FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
