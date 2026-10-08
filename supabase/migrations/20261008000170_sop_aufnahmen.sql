-- SOP aus Aufnahme: Audio-/Bildschirmaufnahmen oder hochgeladene Dateien → Transkript → KI-SOP-Entwurf
-- mit Prüf-Durchgang und offenen Fragen. Rohaufnahmen nur über die API (Service-Role, nur Admin).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('akademie-aufnahmen', 'akademie-aufnahmen', false, 524288000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS akademie_aufnahmen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erstellt_von uuid REFERENCES users(id) ON DELETE SET NULL,
  modus text NOT NULL CHECK (modus IN ('audio', 'bildschirm', 'datei')),
  titel text NOT NULL,
  hinweis text,
  -- Seite, auf der aufgenommen wurde: { pfad, seitentitel, kunde_id, schritt }
  kontext jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_pfad text,
  audio_pfade text[] NOT NULL DEFAULT '{}',
  bild_pfade text[] NOT NULL DEFAULT '{}',
  dauer_sek int,
  groesse_bytes bigint,
  status text NOT NULL DEFAULT 'hochladen'
    CHECK (status IN ('hochladen', 'wartet', 'transkription', 'entwurf', 'pruefung', 'fertig', 'fehler')),
  fehler text,
  transkript text,
  artikel_slug text,
  video_key text,
  -- [{ frage, antwort? }]
  offene_fragen jsonb NOT NULL DEFAULT '[]'::jsonb,
  versuche int NOT NULL DEFAULT 0,
  verarbeitung_seit timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_akademie_aufnahmen_offen
  ON akademie_aufnahmen (updated_at)
  WHERE status IN ('wartet', 'transkription', 'entwurf', 'pruefung');

ALTER TABLE akademie_aufnahmen ENABLE ROW LEVEL SECURITY;

-- Wer außer Admins aufnehmen darf (kommagetrennte User-IDs)
INSERT INTO system_einstellungen (key, wert) VALUES ('akademie_aufnahme_erlaubt', '')
ON CONFLICT (key) DO NOTHING;
