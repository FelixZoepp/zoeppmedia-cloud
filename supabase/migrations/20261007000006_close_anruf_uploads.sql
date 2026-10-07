-- Close-Anrufe mit Aufnahme → an Fireflies zur Transkription übergeben (je Anruf einmal)
CREATE TABLE IF NOT EXISTS close_anruf_uploads (
  call_id text PRIMARY KEY,
  lead_id text NOT NULL,
  titel text,
  dauer_sek int,
  status text NOT NULL DEFAULT 'hochgeladen' CHECK (status IN ('hochgeladen', 'fehler')),
  fehler text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE close_anruf_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anruf-Uploads intern lesen" ON close_anruf_uploads FOR SELECT TO authenticated USING (public.is_internal_user());
