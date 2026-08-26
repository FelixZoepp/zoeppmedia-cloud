-- Track which nudges have been sent to avoid spam
CREATE TABLE masterclass_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES masterclass_lessons(id) ON DELETE CASCADE,
  nudge_type TEXT NOT NULL CHECK (nudge_type IN ('reminder', 'overdue', 'milestone')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agency_id, lesson_id, nudge_type)
);

ALTER TABLE masterclass_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages nudges" ON masterclass_nudges FOR ALL
  USING (true) WITH CHECK (true);
