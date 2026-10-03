-- Manuell erfasste Verzögerungen (v.a. aus der Zeit vor dem Ablauf-System) für die Start-Analyse
CREATE TABLE IF NOT EXISTS start_verzoegerungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  tage NUMERIC(5,1) NOT NULL CHECK (tage > 0),
  wer TEXT NOT NULL CHECK (wer IN ('kunde', 'zoepp')),
  grund TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_start_verzoegerungen_agency ON start_verzoegerungen(agency_id);
ALTER TABLE start_verzoegerungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "start_verzoegerungen internal" ON start_verzoegerungen FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
