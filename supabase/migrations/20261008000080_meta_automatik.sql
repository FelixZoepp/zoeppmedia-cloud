-- Meta-Automatik: Zugänge per Graph-API prüfen, Kampagne per API anlegen (pausiert)

-- Gefundene Assets + letzte Zugangsprüfung je Kunde
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_pixel_id text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_instagram_id text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_zugang_pruefung jsonb;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS meta_zugang_geprueft_am timestamptz;

-- Eine Kampagne je Kunde (idempotente Anlage)
CREATE TABLE IF NOT EXISTS meta_kampagnen (
  agency_id uuid PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  campaign_id text,
  adset_id text,
  status text NOT NULL DEFAULT 'angelegt' CHECK (status IN ('angelegt', 'aktiv', 'fehler')),
  ziel text,
  tagesbudget numeric(10,2),
  targeting jsonb,
  fehler text,
  in_arbeit_seit timestamptz,
  angelegt_am timestamptz,
  aktiviert_am timestamptz,
  aktiviert_von uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meta_kampagnen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Intern verwaltet" ON meta_kampagnen;
CREATE POLICY "Intern verwaltet" ON meta_kampagnen FOR ALL TO authenticated
  USING (is_internal_user()) WITH CHECK (is_internal_user());

-- Meta-IDs je Ad (nicht doppelt anlegen)
ALTER TABLE ad_items ADD COLUMN IF NOT EXISTS meta_ad_id text;
ALTER TABLE ad_items ADD COLUMN IF NOT EXISTS meta_creative_id text;
ALTER TABLE ad_items ADD COLUMN IF NOT EXISTS meta_video_id text;
ALTER TABLE ad_items ADD COLUMN IF NOT EXISTS meta_fehler text;
