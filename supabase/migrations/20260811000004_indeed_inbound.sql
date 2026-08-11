-- 1. Extend candidates with Indeed/resume fields
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience_summary TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_employer TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS indeed_job_title TEXT;

-- 2. Inbound email log for debugging
CREATE TABLE inbound_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('processed', 'failed', 'no_agency')),
  error_message TEXT,
  candidate_id UUID REFERENCES candidates(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inbound_email_log_agency ON inbound_email_log(agency_id);
CREATE INDEX idx_inbound_email_log_status ON inbound_email_log(status);

ALTER TABLE inbound_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read email log" ON inbound_email_log FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can insert email log" ON inbound_email_log FOR INSERT
  WITH CHECK (true);
