-- Fulfillment-Generator: ein Klick erzeugt Ad-Konzepte, Video-Skripte, Webseiten-Video, Funnel-Texte, Indeed-Anzeige
CREATE TABLE IF NOT EXISTS fulfillment_generierungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'laeuft' CHECK (status IN ('laeuft', 'fertig', 'fehler')),
  -- { "ads": "laeuft" | "fertig" | "fehler: …", … }
  teile jsonb NOT NULL DEFAULT '{}'::jsonb,
  zusatz text,
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  fertig_am timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_generierungen_agency ON fulfillment_generierungen(agency_id, gestartet_am DESC);

-- Inhalte, die keine Ads sind (Funnel-Texte, Webseiten-Video-Skript) – jede Generierung = neue Version
CREATE TABLE IF NOT EXISTS fulfillment_inhalte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  generierung_id uuid REFERENCES fulfillment_generierungen(id) ON DELETE SET NULL,
  art text NOT NULL CHECK (art IN ('funnel', 'webseiten_video')),
  inhalt jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_inhalte_agency ON fulfillment_inhalte(agency_id, art, created_at DESC);

-- Nur intern (Zugriff über die Server-APIs mit Service-Role)
ALTER TABLE fulfillment_generierungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_inhalte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Generierungen intern" ON fulfillment_generierungen FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "Inhalte intern" ON fulfillment_inhalte FOR SELECT TO authenticated USING (public.is_internal_user());
