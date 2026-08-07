-- Phase 2: Onboarding submissions, fulfillment tasks, generated content

-- 1. Onboarding submissions
CREATE TABLE onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),

  -- Company info
  company_name TEXT,
  industry TEXT,
  region TEXT,
  employee_count TEXT,
  website_url TEXT,

  -- Recruiting goals
  hiring_target INTEGER,
  hiring_timeframe TEXT,
  experience_required TEXT,
  compensation_model TEXT,

  -- Branding
  logo_url TEXT,
  primary_color TEXT,
  team_photos JSONB DEFAULT '[]'::jsonb,
  usps TEXT,

  -- Contact
  contact_name TEXT,
  contact_phone TEXT,
  preferred_contact_time TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Fulfillment tasks (auto-generated per agency)
CREATE TYPE fulfillment_status AS ENUM ('pending', 'in_progress', 'review', 'done', 'skipped');

CREATE TABLE fulfillment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL CHECK (task_type IN ('perspective_funnel', 'ad_copy', 'script', 'meta_campaign', 'other')),
  status fulfillment_status DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  result_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Generated content (AI outputs)
CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  fulfillment_task_id UUID REFERENCES fulfillment_tasks(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('ad_copy', 'script', 'funnel_text', 'other')),
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  approved BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Perspective funnels tracking
CREATE TABLE perspective_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  perspective_funnel_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE perspective_funnels ENABLE ROW LEVEL SECURITY;

-- Onboarding: agency users can read/create their own, admins+employees see all
CREATE POLICY "Agency users manage own onboarding" ON onboarding_submissions
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

-- Fulfillment: admins+employees full access, agency users can read
CREATE POLICY "Internal users manage fulfillment" ON fulfillment_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Agency users read own fulfillment" ON fulfillment_tasks
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Generated content: same as fulfillment
CREATE POLICY "Internal users manage content" ON generated_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Agency users read own content" ON generated_content
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Perspective funnels: same pattern
CREATE POLICY "Internal users manage funnels" ON perspective_funnels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

CREATE POLICY "Agency users read own funnels" ON perspective_funnels
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- 6. Indexes
CREATE INDEX idx_onboarding_agency ON onboarding_submissions(agency_id);
CREATE INDEX idx_fulfillment_agency ON fulfillment_tasks(agency_id);
CREATE INDEX idx_fulfillment_assigned ON fulfillment_tasks(assigned_to);
CREATE INDEX idx_generated_content_agency ON generated_content(agency_id);
CREATE INDEX idx_perspective_funnels_agency ON perspective_funnels(agency_id);

-- 7. Add onboarding_completed flag to agencies
ALTER TABLE agencies ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
