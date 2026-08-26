CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  agency_id UUID REFERENCES agencies(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'agency', 'user', 'automation', 'template', 'pipeline_stage', 'consent', 'recording', 'settings')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'access', 'impersonate')),
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_agency ON audit_log(agency_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins see audit log" ON audit_log FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin'));
CREATE POLICY "Service manages audit log" ON audit_log FOR ALL
  USING (true) WITH CHECK (true);
