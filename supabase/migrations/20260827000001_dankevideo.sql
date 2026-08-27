-- Video URL per agency
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS dankevideo_url TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS dankevideo_active BOOLEAN DEFAULT false;

-- Track video views per candidate
CREATE TABLE video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  video_url TEXT NOT NULL,
  view_token TEXT NOT NULL UNIQUE,
  viewed_at TIMESTAMPTZ,
  view_progress INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_views_candidate ON video_views(candidate_id);
CREATE INDEX idx_video_views_token ON video_views(view_token);

ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own views" ON video_views FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users see all views" ON video_views FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages views" ON video_views FOR ALL
  USING (true) WITH CHECK (true);
