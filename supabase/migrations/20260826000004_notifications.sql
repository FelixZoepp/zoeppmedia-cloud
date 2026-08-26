CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'new_candidate', 'stage_change', 'call_result', 'task_assigned',
    'task_due', 'sla_breach', 'noshow', 'opt_out', 'system'
  )),
  entity_type TEXT CHECK (entity_type IN ('candidate', 'task', 'agency')),
  entity_id UUID,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "Service can manage notifications" ON notifications FOR ALL
  USING (true) WITH CHECK (true);
