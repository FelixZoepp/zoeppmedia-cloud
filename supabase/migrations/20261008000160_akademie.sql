-- Team-Akademie: SOPs, Skripte, Wissen, FAQ für interne Mitarbeiter + Akademie-Bot.
-- Nur Service-Role (alle Zugriffe laufen über die API mit Rollen- und Freischaltungsprüfung).
-- Inhalte werden beim ersten Aufruf aus src/lib/akademie/inhalte.ts angelegt (nur fehlende Einträge).

CREATE TABLE IF NOT EXISTS akademie_artikel (
  slug text PRIMARY KEY,
  typ text NOT NULL CHECK (typ IN ('sop', 'skript', 'wissen', 'faq', 'rolle')),
  titel text NOT NULL,
  modul text NOT NULL,
  positionen text[] NOT NULL DEFAULT '{}',
  step_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'freigegeben')),
  quelle text,
  zusammenfassung text,
  -- SOP-Abschnitte: zweck, ausloeser, automatisch[], schritte[], qualitaet[], fehler[], links[{label,href}]
  abschnitte jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Freitext (Markdown) für Skripte, Wissen, FAQ, Rollen
  inhalt text,
  video_key text,
  prioritaet int NOT NULL DEFAULT 3,
  reihenfolge int NOT NULL DEFAULT 100,
  -- Entwurf, der einen bestehenden Artikel ergänzen soll
  ergaenzt_slug text,
  such_text text NOT NULL DEFAULT '',
  fts tsvector GENERATED ALWAYS AS (to_tsvector('german', coalesce(titel, '') || ' ' || coalesce(such_text, ''))) STORED,
  bearbeitet_von uuid REFERENCES users(id) ON DELETE SET NULL,
  bearbeitet_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_akademie_artikel_fts ON akademie_artikel USING gin (fts);
CREATE INDEX IF NOT EXISTS idx_akademie_artikel_steps ON akademie_artikel USING gin (step_keys);

CREATE TABLE IF NOT EXISTS akademie_videos (
  key text PRIMARY KEY,
  titel text NOT NULL,
  session text NOT NULL,
  session_reihenfolge int NOT NULL DEFAULT 1,
  laenge_min int NOT NULL DEFAULT 4,
  prioritaet int NOT NULL DEFAULT 3,
  drehbuch text[] NOT NULL DEFAULT '{}',
  video_url text,
  status text NOT NULL DEFAULT 'aufnahme_noetig' CHECK (status IN ('aufnahme_noetig', 'aufgenommen', 'nicht_noetig')),
  aufgenommen_am timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Freischaltung je Mitarbeiter: Position an/aus (ohne Zeile gilt der Vorschlag aus users.funktion)
CREATE TABLE IF NOT EXISTS akademie_freigaben (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position text NOT NULL,
  an boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, position)
);

-- Einzelne Artikel zusätzlich frei- oder ausschalten
CREATE TABLE IF NOT EXISTS akademie_artikel_freigaben (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES akademie_artikel(slug) ON DELETE CASCADE,
  an boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slug)
);

CREATE TABLE IF NOT EXISTS akademie_fortschritt (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES akademie_artikel(slug) ON DELETE CASCADE,
  gelesen_am timestamptz,
  video_gesehen_am timestamptz,
  PRIMARY KEY (user_id, slug)
);

CREATE TABLE IF NOT EXISTS akademie_luecken (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frage text NOT NULL,
  frage_norm text NOT NULL UNIQUE,
  anzahl int NOT NULL DEFAULT 1,
  positionen text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erledigt', 'ignoriert')),
  artikel_slug text,
  zuletzt_am timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akademie_bot_antworten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  frage text NOT NULL,
  antwort text NOT NULL,
  quellen text[] NOT NULL DEFAULT '{}',
  luecke boolean NOT NULL DEFAULT false,
  bewertung smallint CHECK (bewertung IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS akademie_importe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art text NOT NULL CHECK (art IN ('text', 'datei', 'audio', 'gespraech', 'luecke')),
  titel text,
  rohtext text,
  status text NOT NULL DEFAULT 'neu' CHECK (status IN ('neu', 'verarbeitet', 'fehler')),
  fehler text,
  entwuerfe text[] NOT NULL DEFAULT '{}',
  erstellt_von uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE akademie_artikel ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_freigaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_artikel_freigaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_fortschritt ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_luecken ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_bot_antworten ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_importe ENABLE ROW LEVEL SECURITY;
