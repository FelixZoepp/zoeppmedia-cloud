-- KI-Grafiken für Anzeigen: Bild-Varianten je Ad (Abschnitt 4, Review 2026-10-08)
-- Ausgewählte Variante steht wie bisher in asset_path (Bucket ad-assets) – Vorschau, KI-Prüfung und Meta nutzen weiter asset_path.
ALTER TABLE public.ad_items ADD COLUMN IF NOT EXISTS bild_varianten jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ad_items ADD COLUMN IF NOT EXISTS bilder_status text;

COMMENT ON COLUMN public.ad_items.bild_varianten IS 'KI-Bildvarianten: [{pfad, format, groesse, modell, erstellt_am}] im Bucket ad-assets';
COMMENT ON COLUMN public.ad_items.bilder_status IS 'null | laeuft | fertig | fehler: <Grund> – Stand der KI-Bilderzeugung';
