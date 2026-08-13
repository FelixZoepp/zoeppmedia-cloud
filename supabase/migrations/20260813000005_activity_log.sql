CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'login', 'call', 'stage_change', 'note', 'content_approval',
    'content_rejection', 'recording_upload', 'onboarding_complete',
    'survey_submitted', 'funnel_published', 'candidate_created',
    'invite_sent', 'email_sent', 'task_completed', 'other'
  )),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_agency ON activity_log(agency_id);
CREATE INDEX idx_activity_log_candidate ON activity_log(candidate_id);
CREATE INDEX idx_activity_log_type ON activity_log(action_type);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read all activity" ON activity_log FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Agency can read own activity" ON activity_log FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Anyone can insert activity" ON activity_log FOR INSERT
  WITH CHECK (true);

-- Login history table
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_login_history_user ON login_history(user_id);
CREATE INDEX idx_login_history_agency ON login_history(agency_id);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read login history" ON login_history FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Anyone can insert login" ON login_history FOR INSERT
  WITH CHECK (true);
