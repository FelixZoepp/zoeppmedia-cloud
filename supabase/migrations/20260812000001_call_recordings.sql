-- Call Recordings: audio/video uploads with transcription and AI analysis

CREATE TABLE call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  recording_type TEXT NOT NULL CHECK (recording_type IN ('erstgespraech', 'vorstellungsgespraech', 'follow_up', 'sonstiges')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  duration_seconds INTEGER,
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'done', 'failed')),
  analysis JSONB,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_call_recordings_candidate ON call_recordings(candidate_id);
CREATE INDEX idx_call_recordings_agency ON call_recordings(agency_id);

ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read own recordings"
  ON call_recordings FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert own recordings"
  ON call_recordings FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal users can read all recordings"
  ON call_recordings FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
