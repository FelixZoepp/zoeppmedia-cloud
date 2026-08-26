-- Automation rules
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'candidate_created', 'stage_changed', 'call_logged',
    'noshow_recorded', 'opt_out', 'task_overdue',
    'appointment_created', 'appointment_cancelled',
    'candidate_idle', 'manual'
  )),
  conditions JSONB DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  delay_seconds INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_agency ON automations(agency_id);
CREATE INDEX idx_automations_trigger ON automations(trigger_event);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own automations" ON automations FOR SELECT
  USING (
    agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
    OR agency_id IS NULL
    OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
  );
CREATE POLICY "Internal users manage automations" ON automations FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages automations" ON automations FOR ALL
  USING (true) WITH CHECK (true);

-- Automation run log
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  candidate_id UUID REFERENCES candidates(id),
  trigger_data JSONB,
  actions_executed JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id);
CREATE INDEX idx_automation_runs_agency ON automation_runs(agency_id);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users see runs" ON automation_runs FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages runs" ON automation_runs FOR ALL
  USING (true) WITH CHECK (true);
