-- supabase/migrations/20260811000003_kpi_playbook_surveys.sql
-- Phase 2: KPI System, Playbook, Survey Schedule

-- 1. KPI Defaults
CREATE TABLE kpi_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  default_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lower_is_better', 'higher_is_better')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO kpi_defaults (kpi_key, label, default_value, unit, direction) VALUES
  ('max_cpl', 'Max CPL', 40, 'Euro', 'lower_is_better'),
  ('min_reach_rate', 'Min Erreichbarkeit', 50, 'Prozent', 'higher_is_better'),
  ('min_termin_rate', 'Min Termin-Quote', 15, 'Prozent', 'higher_is_better'),
  ('max_response_hours', 'Max Reaktionszeit', 24, 'Stunden', 'lower_is_better'),
  ('min_candidates_week', 'Min Bewerber/Woche', 5, 'Anzahl', 'higher_is_better'),
  ('max_phase_days', 'Max Phase-Dauer', 5, 'Tage', 'lower_is_better'),
  ('min_indeed_per_2days', 'Indeed Min Bewerber/2 Tage', 1, 'Anzahl', 'higher_is_better'),
  ('min_satisfaction', 'Min Zufriedenheit', 3, 'Sterne', 'higher_is_better');

ALTER TABLE kpi_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read kpi_defaults" ON kpi_defaults FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Admin can manage kpi_defaults" ON kpi_defaults FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 2. Agency KPI Overrides
CREATE TABLE agency_kpi_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kpi_key TEXT NOT NULL REFERENCES kpi_defaults(kpi_key) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  set_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agency_id, kpi_key)
);

ALTER TABLE agency_kpi_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage overrides" ON agency_kpi_overrides FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 3. Agency Problems
CREATE TABLE agency_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  problem_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  current_value NUMERIC,
  target_value NUMERIC,
  details JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX idx_agency_problems_active ON agency_problems(agency_id) WHERE resolved_at IS NULL;

ALTER TABLE agency_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage problems" ON agency_problems FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));

-- 4. Playbook Entries
CREATE TABLE playbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  causes TEXT[] NOT NULL DEFAULT '{}',
  immediate_actions TEXT[] NOT NULL DEFAULT '{}',
  long_term_actions TEXT[] NOT NULL DEFAULT '{}',
  escalation_trigger TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO playbook_entries (problem_key, title, description, causes, immediate_actions, long_term_actions, escalation_trigger) VALUES
(
  'low_reach_rate',
  'Erreichbarkeit zu niedrig',
  'Weniger als die Hälfte der Bewerber wird am Telefon erreicht.',
  ARRAY['Falsche Anrufzeiten', 'Bewerber haben Tagschicht', 'Nummer falsch/unvollständig', 'Zu wenige Anrufversuche'],
  ARRAY['Anrufzeiten anpassen (morgens 9-11, nachmittags 15-17)', 'Doppelanruf-Strategie (2x täglich)', 'WhatsApp-Nachricht als Alternative senden', 'Nummern auf Vollständigkeit prüfen'],
  ARRAY['Funnel-Formular um "Beste Erreichbarkeit" erweitern', 'SMS-Benachrichtigung bei Bewerbungseingang', 'Automatische Kalender-Buchung im Funnel'],
  'Wenn nach 1 Woche keine Verbesserung → Felix informieren'
),
(
  'low_termin_rate',
  'Wenig Termine',
  'Zu wenige Anrufe führen zu einem Vorstellungsgespräch.',
  ARRAY['Skript nicht überzeugend genug', 'Bewerber nicht vorqualifiziert', 'Fehlende Einwandbehandlung', 'Tonalität zu aggressiv/passiv'],
  ARRAY['Skript-Opening überarbeiten (Nutzen in ersten 10 Sekunden)', 'Einwandbehandlung üben (Kein Interesse, Keine Zeit, Muss überlegen)', 'Fragen stellen statt pitchen', 'Termin als Low-Commitment framen'],
  ARRAY['Qualifikations-Fragen im Funnel verschärfen', 'Video-Bewerbung als Vorfilter', 'Automatic Scheduling im Funnel einbauen'],
  'Wenn Quote unter 10% nach 2 Wochen → Skript-Review mit Felix'
),
(
  'high_cpl',
  'CPL zu hoch',
  'Die Kosten pro Bewerber über Meta Ads übersteigen das Ziel.',
  ARRAY['Zielgruppe zu breit', 'Creative-Ermüdung (gleiche Ads zu lange)', 'Schlechte Landingpage-Conversion', 'Falsches Placement'],
  ARRAY['Zielgruppe einengen (Alter, Region, Interessen)', 'Mindestens 3 Creative-Varianten aktiv halten', 'Funnel-Ladezeit und Conversion prüfen', 'Placement auf Feed+Stories beschränken'],
  ARRAY['Lookalike-Audience aus bisherigen Bewerbern erstellen', 'Retargeting-Kampagne parallel schalten', 'A/B-Testing Routine einführen (wöchentlich neue Variante)'],
  'CPL > €60 für mehr als 5 Tage → Budget pausieren und Review'
),
(
  'low_candidates',
  'Wenig Bewerber',
  'Weniger als 5 Bewerber pro Woche eingegangen.',
  ARRAY['Budget zu niedrig', 'Saisonale Schwankung', 'Kampagne läuft nicht (Fehler)', 'Funnel-Conversion-Problem'],
  ARRAY['Budget prüfen (Minimum €30/Tag empfohlen)', 'Kampagne auf Fehler checken (abgelehnte Ads, Billing)', 'Indeed-Anzeige parallel schalten falls nicht aktiv', 'Funnel-Conversion-Rate prüfen (< 10% = Problem)'],
  ARRAY['Zweiten Kanal aufbauen (Indeed + Meta parallel)', 'Mitarbeiter-Empfehlungsprogramm vorschlagen', 'Content-Marketing (organische Reichweite)'],
  '0 Bewerber in 3+ Tagen → Sofort-Check'
),
(
  'no_calls_24h',
  'Kunde ruft nicht an',
  'Es sind offene Bewerber da, aber der Kunde hat seit 24h niemanden angerufen.',
  ARRAY['Kunde vergisst/priorisiert nicht', 'Unsicherheit am Telefon', 'Kein Zugang zur Cloud', 'Überforderung bei vielen Bewerbern'],
  ARRAY['Erinnerung an Kunden senden (Email/WhatsApp)', 'Masterclass-Video "Bewerber richtig callen" empfehlen', 'Anbieten: Erste Anrufe gemeinsam machen', 'Bewerber nach Priorität sortieren (neueste zuerst)'],
  ARRAY['Automatische tägliche Email-Erinnerung bei offenen Bewerbern', 'Gamification (Anruf-Streak)', 'Vereinfachtes Call-Interface in der Cloud'],
  '48h ohne Anruf → Persönliches Telefonat mit Kunden'
),
(
  'pipeline_stall',
  'Pipeline-Stau',
  'Bewerber sitzen länger als 5 Tage in einer Pipeline-Phase ohne Fortschritt.',
  ARRAY['Kunde hat Bewerber vergessen', 'Terminverschiebung ohne Update', 'Entscheidungsprobleme', 'Bewerber ghostet'],
  ARRAY['Kunden kontaktieren und Status abfragen', 'Bewerber direkt anrufen falls Kontaktdaten da', 'Status aktualisieren (ggf. auf Absage)', 'Follow-Up-Termin setzen'],
  ARRAY['Automatische Erinnerung an Kunden bei stagnierendem Bewerber', 'Maximale Phase-Dauer als Regel kommunizieren', 'Wöchentlichen Pipeline-Review einführen'],
  '> 10 Tage in Phase → Bewerber als verloren markieren'
),
(
  'low_satisfaction',
  'Niedrige Zufriedenheit',
  'Der Kunde hat im letzten Feedback weniger als 3 Sterne gegeben.',
  ARRAY['Unerfüllte Erwartungen', 'Kommunikationsprobleme', 'Qualität der Bewerber', 'Langsame Reaktionszeiten unsererseits'],
  ARRAY['Sofort Kunden-Call (nicht Email)', 'Offenes Feedback einholen (Was konkret stört)', 'Konkreten Verbesserungsplan aufsetzen', 'Felix informieren'],
  ARRAY['Proaktivere Kommunikation (wöchentliche Updates)', 'Erwartungsmanagement verbessern (Onboarding)', 'Dedizierte Ansprechpartner-Struktur'],
  'Unter 2 Sterne oder 2x unter 3 → Felix übernimmt Kundenkontakt'
),
(
  'indeed_no_candidates',
  'Indeed performt nicht',
  'Keine Bewerber über Indeed in den letzten 2 Tagen.',
  ARRAY['Stellenanzeige nicht sichtbar (SEO-Titel)', 'Gehalt/Benefits nicht prominent genug', 'Falscher Standort', 'Anzeige nicht aktiv/gesponsort'],
  ARRAY['Stellentitel SEO-optimieren (häufig gesuchte Begriffe)', 'Gehalt und Top-3-Benefits in die ersten 2 Zeilen', 'Standort prüfen (PLZ vs. Stadt)', 'Sponsored Job aktivieren falls Budget da'],
  ARRAY['A/B-Test mit verschiedenen Titeln', 'Indeed-Unternehmensprofil mit Fotos/Videos aufwerten', 'Google for Jobs Optimierung (strukturierte Daten)'],
  '5+ Tage ohne Indeed-Bewerber → Kanal-Wechsel evaluieren'
);

ALTER TABLE playbook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can read playbook" ON playbook_entries FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Admin can manage playbook" ON playbook_entries FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 5. Survey Schedule
CREATE TABLE survey_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES survey_templates(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  response_id UUID REFERENCES survey_responses(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_survey_schedule_pending ON survey_schedule(agency_id) WHERE completed_at IS NULL;

ALTER TABLE survey_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage survey_schedule" ON survey_schedule FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Agency can read own survey_schedule" ON survey_schedule FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));

-- 6. Additional survey templates
INSERT INTO survey_templates (title, description, questions, active) VALUES
(
  'Onboarding-Feedback',
  'Wie war dein Onboarding-Erlebnis?',
  '[{"id":"onboarding_ease","type":"rating","label":"Wie einfach war der Onboarding-Prozess?"},{"id":"questions_answered","type":"rating","label":"Wie gut wurden deine Fragen beantwortet?"},{"id":"communication","type":"rating","label":"Wie zufrieden bist du mit der bisherigen Kommunikation?"}]'::jsonb,
  true
),
(
  'Erste Eindrücke',
  'Dein Feedback nach den ersten 2 Wochen.',
  '[{"id":"candidate_quality","type":"rating","label":"Wie zufrieden bist du mit der Bewerber-Qualität?"},{"id":"cloud_usability","type":"rating","label":"Wie gut funktioniert das Bewerber-Management in der Cloud?"},{"id":"collaboration","type":"rating","label":"Wie bewertest du die bisherige Zusammenarbeit?"},{"id":"recommend","type":"rating","label":"Würdest du uns weiterempfehlen?"}]'::jsonb,
  true
),
(
  'Gesamtbewertung',
  'Quartalsmäßige Gesamtbewertung der Zusammenarbeit.',
  '[{"id":"overall","type":"rating","label":"Gesamtzufriedenheit"},{"id":"communication","type":"rating","label":"Kommunikation"},{"id":"campaign_quality","type":"rating","label":"Qualität der Kampagnen"},{"id":"candidate_quality","type":"rating","label":"Qualität der Bewerber"},{"id":"value_for_money","type":"rating","label":"Preis-Leistung"},{"id":"recommend","type":"rating","label":"Weiterempfehlung"}]'::jsonb,
  true
);

-- 7. invite_tokens: add email_sent_at
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
