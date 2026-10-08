-- Team-Akademie: Checklisten je Vorgang, Review-Checklisten, Wissenschecks, Hilfe-Modus.
-- Nur Service-Role (Zugriff über die API mit Freischaltungsprüfung).

-- Video lässt sich ideal mit „SOP aufnehmen“ erledigen (Bildschirm + Stimme)
ALTER TABLE akademie_videos ADD COLUMN IF NOT EXISTS sop_aufnahme boolean NOT NULL DEFAULT false;

-- Baustein 3: Checkliste zum Abarbeiten – pro Nutzer, Artikel und Vorgang (z. B. step:<id>, pfad:/clients/…)
CREATE TABLE IF NOT EXISTS akademie_checklisten (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES akademie_artikel(slug) ON DELETE CASCADE,
  kontext text NOT NULL DEFAULT '',
  erledigt int[] NOT NULL DEFAULT '{}',
  abgeschlossen_am timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slug, kontext)
);

-- Baustein 4: Review-Checkliste – Selbstcheck, optional Prüfung durch Führung
CREATE TABLE IF NOT EXISTS akademie_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL REFERENCES akademie_artikel(slug) ON DELETE CASCADE,
  kontext text NOT NULL DEFAULT '',
  erledigt int[] NOT NULL DEFAULT '{}',
  notiz text,
  status text NOT NULL DEFAULT 'selbstcheck' CHECK (status IN ('selbstcheck', 'zur_pruefung', 'geprueft', 'nacharbeit')),
  pruefer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  pruefer_kommentar text,
  geprueft_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug, kontext)
);
CREATE INDEX IF NOT EXISTS idx_akademie_reviews_offen ON akademie_reviews (updated_at DESC) WHERE status = 'zur_pruefung';

-- Wissenscheck am Ende jeder Bereichs-Akademie
CREATE TABLE IF NOT EXISTS akademie_wissenschecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bereich text NOT NULL,
  richtig int NOT NULL,
  gesamt int NOT NULL,
  bestanden boolean NOT NULL,
  antworten jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_akademie_wissenschecks_user ON akademie_wissenschecks (user_id, bereich, created_at DESC);

-- Aufgabe erledigt, obwohl die Checkliste offen war (Protokoll)
CREATE TABLE IF NOT EXISTS akademie_erledigt_hinweise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  kontext text NOT NULL DEFAULT '',
  offene_punkte text[] NOT NULL DEFAULT '{}',
  aktion text NOT NULL CHECK (aktion IN ('trotzdem', 'zur_checkliste')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hilfe-Modus je Nutzer (ohne Zeile: Standard – an für Mitarbeiter, aus für Admins)
CREATE TABLE IF NOT EXISTS akademie_einstellungen (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hilfe_modus boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE akademie_checklisten ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_wissenschecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_erledigt_hinweise ENABLE ROW LEVEL SECURITY;
ALTER TABLE akademie_einstellungen ENABLE ROW LEVEL SECURITY;
