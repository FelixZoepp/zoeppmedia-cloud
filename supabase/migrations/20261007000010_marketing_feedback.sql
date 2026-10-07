-- Wöchentliches Marketing-Feedback aus Einwänden und Fragen der Gesprächsanalysen
CREATE TABLE IF NOT EXISTS marketing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  von date NOT NULL,
  bis date NOT NULL,
  gespraeche int NOT NULL,
  inhalt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_feedback_zeit ON marketing_feedback(created_at DESC);
ALTER TABLE marketing_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Marketing-Feedback intern lesen" ON marketing_feedback FOR SELECT TO authenticated USING (public.is_internal_user());
