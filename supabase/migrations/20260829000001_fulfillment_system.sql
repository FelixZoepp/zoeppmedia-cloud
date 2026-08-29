-- =============================================================================
-- Fulfillment System Phase 1: Data Model Extension
-- =============================================================================
-- Extends agencies & users, creates: client_profiles, task_templates,
-- project_tasks, task_checkitems, access_items, access_item_templates,
-- transcripts, transcript_questions, transcript_answers, health_checks, reports
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend agencies table (client master data for fulfillment)
-- ---------------------------------------------------------------------------
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS rechtsform TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS anschrift TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS rechnungsmail TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS ust_id TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS paket TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS mrr NUMERIC(10,2);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS setup_betrag NUMERIC(10,2);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS laufzeit_monate INTEGER;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS werbebudget NUMERIC(10,2);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_start DATE;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS garantie_ende DATE;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS csm_user_id UUID REFERENCES users(id);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'onboarding'
  CHECK (status IN ('onboarding', 'aktiv', 'pausiert', 'gekuendigt', 'setup_fehler'));
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS zusagen_closer TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sonderfaelle TEXT;

-- ---------------------------------------------------------------------------
-- 2. Client Profiles (Copy-Datenbank)
-- ---------------------------------------------------------------------------
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  gesuchte_rolle TEXT,
  anstellungsart TEXT,
  fuehrerschein_noetig BOOLEAN,
  provisionsmodell TEXT,
  verdienstspanne TEXT,
  startbonus TEXT,
  karrierestufen TEXT[],
  alleinstellung TEXT,
  bleibegruende TEXT,
  belegbare_zahlen JSONB DEFAULT '[]',
  tonalitaet TEXT DEFAULT 'du',
  verbotene_claims TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency sees own profile" ON client_profiles FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal manages profiles" ON client_profiles FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages profiles" ON client_profiles FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Task Templates (Aufgabenbibliothek)
-- ---------------------------------------------------------------------------
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titel TEXT NOT NULL,
  prozess TEXT NOT NULL CHECK (prozess IN (
    'onboarding', 'funnel', 'tracking', 'content', 'ads', 'betrieb', 'abschluss'
  )),
  beschreibung TEXT,
  owner_funktion TEXT CHECK (owner_funktion IN (
    'ops', 'content', 'media_buyer', 'csm', 'backoffice', 'kunde'
  )),
  ausloeser TEXT CHECK (ausloeser IN (
    'after_close', 'zugaenge_komplett', 'transkript_geprueft',
    'funnel_veroeffentlicht', 'ad_copy_freigegeben', 'kampagne_live', 'manuell'
  )),
  sla_tage INTEGER DEFAULT 3,
  reihenfolge INTEGER DEFAULT 0,
  abhaengig_von UUID[],
  checkliste TEXT[] DEFAULT '{}',
  benoetigte_zugaenge TEXT[] DEFAULT '{}',
  vorlagen_links TEXT[] DEFAULT '{}',
  definition_of_done TEXT,
  abgabe_typ TEXT DEFAULT 'haken' CHECK (abgabe_typ IN ('link', 'datei', 'text', 'haken')),
  freigabe_noetig BOOLEAN DEFAULT false,
  aktiv BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal reads templates" ON task_templates FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Admin manages templates" ON task_templates FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Service manages templates" ON task_templates FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Project Tasks (Instanzen je Kunde)
-- ---------------------------------------------------------------------------
CREATE TABLE project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES task_templates(id),
  titel TEXT NOT NULL,
  beschreibung TEXT,
  owner_user_id UUID REFERENCES users(id),
  owner_funktion TEXT,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'blockiert', 'offen', 'in_arbeit', 'zur_freigabe', 'erledigt', 'nicht_noetig'
  )),
  faellig_am TIMESTAMPTZ,
  gestartet_am TIMESTAMPTZ,
  erledigt_am TIMESTAMPTZ,
  ergebnis_url TEXT,
  ergebnis_text TEXT,
  notiz TEXT,
  blockiert_durch UUID[],
  freigabe_noetig BOOLEAN DEFAULT false,
  reihenfolge INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_tasks_agency ON project_tasks(agency_id);
CREATE INDEX idx_project_tasks_owner ON project_tasks(owner_user_id);
CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_faellig ON project_tasks(faellig_am)
  WHERE status NOT IN ('erledigt', 'nicht_noetig');

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency sees own tasks" ON project_tasks FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Agency updates own tasks" ON project_tasks FOR UPDATE
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal manages tasks" ON project_tasks FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages tasks" ON project_tasks FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. Task Checkitems
-- ---------------------------------------------------------------------------
CREATE TABLE task_checkitems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  reihenfolge INTEGER DEFAULT 0,
  erledigt BOOLEAN DEFAULT false,
  erledigt_von UUID REFERENCES users(id),
  erledigt_am TIMESTAMPTZ
);

CREATE INDEX idx_task_checkitems_task ON task_checkitems(task_id);

ALTER TABLE task_checkitems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows parent task" ON task_checkitems FOR SELECT
  USING (task_id IN (
    SELECT id FROM project_tasks
    WHERE agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Internal manages checkitems" ON task_checkitems FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Agency updates checkitems" ON task_checkitems FOR UPDATE
  USING (task_id IN (
    SELECT id FROM project_tasks
    WHERE agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
  ));

CREATE POLICY "Service manages checkitems" ON task_checkitems FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Access Items (Zugangsverwaltung)
-- ---------------------------------------------------------------------------
CREATE TABLE access_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN (
    'meta_partnerschaft', 'werbekonto', 'facebook_seite', 'instagram',
    'indeed', 'domain', 'logo_assets', 'zahlungsmittel', 'google_ads',
    'perspective', 'sonstiges'
  )),
  label TEXT NOT NULL,
  pflicht BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'offen', 'angefragt', 'erfuellt', 'nicht_noetig'
  )),
  angefragt_am TIMESTAMPTZ,
  erinnert_am TIMESTAMPTZ[],
  erfuellt_am TIMESTAMPTZ,
  hinweis_fuer_kunden TEXT,
  anleitung_url TEXT,
  verantwortlich TEXT DEFAULT 'kunde' CHECK (verantwortlich IN ('kunde', 'ops')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_items_agency ON access_items(agency_id);
CREATE INDEX idx_access_items_status ON access_items(status) WHERE status != 'erfuellt';

ALTER TABLE access_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency sees own access items" ON access_items FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Agency updates own access items" ON access_items FOR UPDATE
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal manages access items" ON access_items FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages access items" ON access_items FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. Transcripts
-- ---------------------------------------------------------------------------
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('onboarding', 'kickoff', 'tracking_call', 'closing')),
  quelle TEXT NOT NULL CHECK (quelle IN (
    'upload_audio', 'upload_video', 'upload_text', 'einfuegen'
  )),
  datei_url TEXT,
  dauer_sekunden INTEGER,
  sprache TEXT DEFAULT 'de',
  volltext TEXT,
  status TEXT NOT NULL DEFAULT 'hochgeladen' CHECK (status IN (
    'hochgeladen', 'transkribiert', 'ausgewertet', 'geprueft'
  )),
  hochgeladen_von UUID REFERENCES users(id),
  geprueft_von UUID REFERENCES users(id),
  geprueft_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcripts_agency ON transcripts(agency_id);

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manages transcripts" ON transcripts FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages transcripts" ON transcripts FOR ALL
  USING (true) WITH CHECK (true);

-- Transcript Questions catalog
CREATE TABLE transcript_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  frage_text TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('onboarding', 'kickoff', 'tracking_call')),
  ziel_feld TEXT,
  pflicht BOOLEAN DEFAULT false,
  reihenfolge INTEGER DEFAULT 0,
  hinweis_fuer_csm TEXT,
  aktiv BOOLEAN DEFAULT true
);

ALTER TABLE transcript_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal reads questions" ON transcript_questions FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Admin manages questions" ON transcript_questions FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Service manages questions" ON transcript_questions FOR ALL
  USING (true) WITH CHECK (true);

-- Transcript Answers
CREATE TABLE transcript_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  frage_key TEXT NOT NULL REFERENCES transcript_questions(key),
  frage_text TEXT NOT NULL,
  antwort TEXT,
  zitat TEXT,
  sicherheit TEXT NOT NULL DEFAULT 'nicht_gefunden' CHECK (sicherheit IN (
    'hoch', 'mittel', 'niedrig', 'nicht_gefunden'
  )),
  ziel_feld TEXT,
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'offen', 'bestaetigt', 'korrigiert', 'nachfragen'
  )),
  korrigierter_wert TEXT,
  geprueft_von UUID REFERENCES users(id),
  geprueft_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcript_answers_transcript ON transcript_answers(transcript_id);

ALTER TABLE transcript_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manages answers" ON transcript_answers FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages answers" ON transcript_answers FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 8. Access Item Templates (per product)
-- ---------------------------------------------------------------------------
CREATE TABLE access_item_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produkt TEXT NOT NULL,
  typ TEXT NOT NULL,
  label TEXT NOT NULL,
  pflicht BOOLEAN DEFAULT true,
  hinweis_fuer_kunden TEXT,
  anleitung_url TEXT,
  verantwortlich TEXT DEFAULT 'kunde',
  reihenfolge INTEGER DEFAULT 0
);

ALTER TABLE access_item_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal reads templates" ON access_item_templates FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Admin manages templates" ON access_item_templates FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Service manages" ON access_item_templates FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. Health Checks
-- ---------------------------------------------------------------------------
CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN (
    'canary_bewerbung', 'pixel', 'stille', 'werbekonto'
  )),
  gelaufen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  ergebnis TEXT NOT NULL CHECK (ergebnis IN ('ok', 'warnung', 'fehler')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_checks_agency ON health_checks(agency_id);

ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal sees checks" ON health_checks FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages checks" ON health_checks FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 10. Reports
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('tag_7', 'tag_14', 'monat', 'zufriedenheit')),
  stichtag DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generiert' CHECK (status IN (
    'generiert', 'freigegeben', 'versendet'
  )),
  daten_json JSONB,
  pdf_url TEXT,
  freigegeben_von UUID REFERENCES users(id),
  freigegeben_am TIMESTAMPTZ,
  versendet_am TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_agency ON reports(agency_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency sees own reports" ON reports FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Internal manages reports" ON reports FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

CREATE POLICY "Service manages reports" ON reports FOR ALL
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 11. Extend users table
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS funktion TEXT
  CHECK (funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS aktiv BOOLEAN DEFAULT true;

COMMIT;
