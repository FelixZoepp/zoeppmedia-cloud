-- Masterclass-Lektionen wie in Memberspot: Status, Inhalt, Tags, Vorschaubild, Kapitel, Anhänge, Eigenschaften.
-- Alles additiv mit Standardwerten – bestehende Lektionen bleiben unverändert sichtbar (Status = veröffentlicht).

ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'veroeffentlicht';
ALTER TABLE masterclass_lessons DROP CONSTRAINT IF EXISTS masterclass_lessons_status_check;
ALTER TABLE masterclass_lessons ADD CONSTRAINT masterclass_lessons_status_check
  CHECK (status IN ('entwurf', 'veroeffentlicht'));

ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS typ text NOT NULL DEFAULT 'video';
ALTER TABLE masterclass_lessons DROP CONSTRAINT IF EXISTS masterclass_lessons_typ_check;
ALTER TABLE masterclass_lessons ADD CONSTRAINT masterclass_lessons_typ_check CHECK (typ IN ('video', 'text'));

ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS content_html text;
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS thumbnail_url text;
-- [{ "sekunden": 75, "titel": "Einstieg" }]
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS kapitel jsonb NOT NULL DEFAULT '[]'::jsonb;
-- [{ "name": "Leitfaden.pdf", "url": "https://…", "art": "datei" | "link" }]
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS anhaenge jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS pflicht boolean NOT NULL DEFAULT false;
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS kein_vorzeitiges_abschliessen boolean NOT NULL DEFAULT false;
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS mit_ki_erstellt boolean NOT NULL DEFAULT false;
ALTER TABLE masterclass_lessons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Loom als weiterer Video-Anbieter
ALTER TABLE masterclass_lessons DROP CONSTRAINT IF EXISTS masterclass_lessons_video_provider_check;
ALTER TABLE masterclass_lessons ADD CONSTRAINT masterclass_lessons_video_provider_check
  CHECK (video_provider IN ('youtube', 'vimeo', 'loom'));
