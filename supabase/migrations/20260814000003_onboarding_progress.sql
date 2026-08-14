CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER,
  UNIQUE(agency_id, step_number)
);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency can manage own progress" ON onboarding_progress FOR ALL TO authenticated
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users can read all progress" ON onboarding_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'employee')));
