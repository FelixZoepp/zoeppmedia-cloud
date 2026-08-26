-- Add optional agency scope to pipeline stages
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_agency ON pipeline_stages(agency_id);

-- Drop old public-read policy
DROP POLICY IF EXISTS "stages public read" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages select" ON pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_select" ON pipeline_stages;

DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can read stages" ON pipeline_stages';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- New policies: users see global stages (agency_id IS NULL) + their own agency stages
CREATE POLICY "Users see global and own stages" ON pipeline_stages FOR SELECT
  USING (
    agency_id IS NULL
    OR agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
  );

CREATE POLICY "Agency owners can manage own stages" ON pipeline_stages FOR ALL
  USING (
    agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
  );
