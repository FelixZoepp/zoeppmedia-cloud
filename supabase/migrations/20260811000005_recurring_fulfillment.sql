-- Recurring Fulfillment: agency package fields + recurring task tracking

-- 1. Agency package fields
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS has_video_shoot BOOLEAN DEFAULT false;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reels_per_month INTEGER DEFAULT 0;

-- 2. Onboarding fields for video/reels
ALTER TABLE onboarding_submissions ADD COLUMN IF NOT EXISTS has_video_shoot BOOLEAN DEFAULT false;
ALTER TABLE onboarding_submissions ADD COLUMN IF NOT EXISTS reels_per_month INTEGER DEFAULT 0;

-- 3. Recurring fulfillment tasks table
CREATE TABLE recurring_fulfillment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL CHECK (task_key IN (
    'indeed_restart', 'creatives_test', 'reels_create', 'video_shoot_plan'
  )),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
  due_date DATE,
  assigned_to UUID REFERENCES users(id),
  triggered_by TEXT CHECK (triggered_by IN ('schedule', 'problem', 'manual')),
  problem_id UUID REFERENCES agency_problems(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recurring_tasks_agency ON recurring_fulfillment_tasks(agency_id);
CREATE INDEX idx_recurring_tasks_status ON recurring_fulfillment_tasks(status) WHERE status != 'done';
CREATE INDEX idx_recurring_tasks_due ON recurring_fulfillment_tasks(due_date) WHERE status = 'pending';

ALTER TABLE recurring_fulfillment_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage recurring tasks"
  ON recurring_fulfillment_tasks FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
