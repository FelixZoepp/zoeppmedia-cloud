-- Migration: call_logs table, extended content_library status, meta fields on agencies
-- Task 1 of end-to-end fulfillment system

-- 1. Call logs table
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  result TEXT NOT NULL CHECK (result IN (
    'termin_vereinbart', 'kein_interesse', 'nicht_erreicht',
    'falsche_nummer', 'rueckruf', 'sonstiges'
  )),
  notes TEXT,
  next_step TEXT CHECK (next_step IN (
    'erneut_anrufen', 'termin_bestaetigen', 'absage', 'warten'
  )),
  next_contact_date DATE,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_call_logs_candidate ON call_logs(candidate_id);
CREATE INDEX idx_call_logs_agency ON call_logs(agency_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);

-- RLS
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read own call logs"
  ON call_logs FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert own call logs"
  ON call_logs FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal users can read all call logs"
  ON call_logs FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 2. Extend content_library status to support full approval flow
-- Drop and recreate the CHECK constraint
ALTER TABLE content_library DROP CONSTRAINT IF EXISTS content_library_status_check;
ALTER TABLE content_library ADD CONSTRAINT content_library_status_check
  CHECK (status IN ('draft', 'internal_review', 'approved_internal', 'client_review', 'approved', 'changes_requested', 'deployed', 'archived'));

-- Add client feedback field
ALTER TABLE content_library ADD COLUMN IF NOT EXISTS client_feedback TEXT;

-- Migrate old status values
UPDATE content_library SET status = 'approved_internal' WHERE status = 'pending_review';

-- 3. Add Meta fields to agencies
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_page_id TEXT;

-- 4. Add onboarding meta access steps
ALTER TABLE onboarding_submissions ADD COLUMN IF NOT EXISTS meta_access_steps JSONB DEFAULT '{}';

-- 5. Extend fulfillment_tasks.task_type CHECK constraint with new types
ALTER TABLE fulfillment_tasks DROP CONSTRAINT IF EXISTS fulfillment_tasks_task_type_check;
ALTER TABLE fulfillment_tasks ADD CONSTRAINT fulfillment_tasks_task_type_check
  CHECK (task_type IN (
    'perspective_funnel', 'ad_copy', 'script', 'meta_campaign', 'other',
    'phone_script', 'video_script', 'job_posting', 'creative_brief',
    'meta_upload', 'funnel_publish', 'manual'
  ));
