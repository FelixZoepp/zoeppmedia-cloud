-- SOP Templates, Content Library, and Approval Workflow

-- 1. SOP Phase templates (static, define the process)
CREATE TABLE sop_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  estimated_days INTEGER DEFAULT 1
);

-- 2. SOP Task templates (static, within phases)
CREATE TABLE sop_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES sop_phases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'manual' CHECK (task_type IN ('manual', 'ai_generate', 'approval', 'external')),
  sort_order INTEGER NOT NULL,
  requires_approval BOOLEAN DEFAULT false,
  ai_content_type TEXT CHECK (ai_content_type IN ('ad_copy', 'phone_script', 'video_script', 'funnel_text', 'job_posting', NULL))
);

-- 3. Customer SOP instances (per agency, tracks progress)
CREATE TABLE customer_sop (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  current_phase INTEGER DEFAULT 1,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(agency_id)
);

-- 4. Customer task instances (per agency, per task)
CREATE TABLE customer_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_sop_id UUID NOT NULL REFERENCES customer_sop(id) ON DELETE CASCADE,
  sop_task_id UUID NOT NULL REFERENCES sop_tasks(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'waiting_approval', 'approved', 'changes_requested', 'done', 'skipped')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Content library (AI-generated and manually created content)
CREATE TABLE content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('ad_copy', 'phone_script', 'video_script', 'funnel_text', 'job_posting')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  variant TEXT,
  version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'changes_requested', 'archived')),
  feedback TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Approval log (tracks all approval actions)
CREATE TABLE approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('task', 'content')),
  item_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'changes_requested', 'resubmitted')),
  comment TEXT,
  acted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. RLS
ALTER TABLE sop_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sop ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_log ENABLE ROW LEVEL SECURITY;

-- SOP templates: public read
CREATE POLICY "Anyone can read sop_phases" ON sop_phases FOR SELECT USING (true);
CREATE POLICY "Anyone can read sop_tasks" ON sop_tasks FOR SELECT USING (true);

-- Customer SOP: agency reads own, internal manages all
CREATE POLICY "Agency reads own sop" ON customer_sop FOR SELECT USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
CREATE POLICY "Internal manages sop" ON customer_sop FOR ALL USING (
  public.get_user_role(auth.uid()) IN ('admin', 'employee')
);

-- Customer tasks: same pattern
CREATE POLICY "Agency reads own tasks" ON customer_tasks FOR SELECT USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
CREATE POLICY "Internal manages tasks" ON customer_tasks FOR ALL USING (
  public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
-- Agency users can update status (for approvals)
CREATE POLICY "Agency approves tasks" ON customer_tasks FOR UPDATE USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
);

-- Content library: agency reads own, internal manages
CREATE POLICY "Agency reads own content" ON content_library FOR SELECT USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
CREATE POLICY "Internal manages content" ON content_library FOR ALL USING (
  public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
-- Agency can update (for approval/feedback)
CREATE POLICY "Agency reviews content" ON content_library FOR UPDATE USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
);

-- Approval log: same pattern
CREATE POLICY "Read own approvals" ON approval_log FOR SELECT USING (
  agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
);
CREATE POLICY "Create approvals" ON approval_log FOR INSERT WITH CHECK (
  acted_by = auth.uid()
);

-- 8. Indexes
CREATE INDEX idx_customer_sop_agency ON customer_sop(agency_id);
CREATE INDEX idx_customer_tasks_sop ON customer_tasks(customer_sop_id);
CREATE INDEX idx_customer_tasks_agency ON customer_tasks(agency_id);
CREATE INDEX idx_customer_tasks_status ON customer_tasks(status);
CREATE INDEX idx_content_library_agency ON content_library(agency_id);
CREATE INDEX idx_content_library_type ON content_library(content_type);
CREATE INDEX idx_approval_log_agency ON approval_log(agency_id);
CREATE INDEX idx_approval_log_item ON approval_log(item_id);

-- 9. Seed SOP phases and tasks

-- Phase 1: Zugänge & Setup
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Zugänge & Setup', 'Accounts einrichten, Zugänge sichern, Cloud-Onboarding', 1, 1);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Meta Business Manager prüfen', 'Hat der Kunde einen BM? Partner-Zugang anfordern oder neuen BM erstellen', 'manual', 1, false),
  ('a1000000-0000-0000-0000-000000000001', 'Werbekonto erstellen/verknüpfen', 'Werbekonto im BM erstellen oder bestehendes verknüpfen', 'manual', 2, false),
  ('a1000000-0000-0000-0000-000000000001', 'Zahlungsmethode hinterlegen', 'Kunden-Kreditkarte als Zahlungsmethode einrichten', 'manual', 3, false),
  ('a1000000-0000-0000-0000-000000000001', 'Meta Pixel erstellen', 'Pixel erstellen und für spätere Funnel-Installation vorbereiten', 'manual', 4, false),
  ('a1000000-0000-0000-0000-000000000001', 'Conversion Events einrichten', 'Lead und Bewerbung als Custom Conversions anlegen', 'manual', 5, false),
  ('a1000000-0000-0000-0000-000000000001', 'Indeed-Konto prüfen/erstellen', 'Zugang zum Indeed-Konto anfordern oder neues erstellen', 'manual', 6, false),
  ('a1000000-0000-0000-0000-000000000001', 'Indeed Unternehmensprofil optimieren', 'Logo, Beschreibung, Fotos im Indeed-Profil einpflegen', 'manual', 7, false),
  ('a1000000-0000-0000-0000-000000000001', 'Agentur in Cloud anlegen', 'Agentur erstellen, Einladungslink generieren und senden', 'manual', 8, false),
  ('a1000000-0000-0000-0000-000000000001', 'Kundenregistrierung prüfen', 'Sicherstellen dass der Kunde sich in der Cloud registriert hat', 'manual', 9, false);

-- Phase 2: Branding & Creatives
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000002', 'Branding & Creatives', 'Markenmaterial sammeln, Creatives designen', 2, 3);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval) VALUES
  ('a1000000-0000-0000-0000-000000000002', 'Branding-Material sammeln', 'Logo (PNG+SVG), Farben, Teamfotos, USPs vom Kunden einholen', 'manual', 1, false),
  ('a1000000-0000-0000-0000-000000000002', 'Gehalts-/Provisionsmodell klären', 'Vergütungsmodell für Anzeigen-Texte definieren', 'manual', 2, false),
  ('a1000000-0000-0000-0000-000000000002', 'Bild-Ads designen (3-5 Varianten)', 'Statische Creatives: Emotional, Geld, Social Proof, Dringlichkeit. Formate: 1080x1080 + 1080x1920', 'manual', 3, true),
  ('a1000000-0000-0000-0000-000000000002', 'Videodreh klären', 'Mit Kunden besprechen ob Videodreh gewünscht. Wenn ja: Termin koordinieren', 'manual', 4, false),
  ('a1000000-0000-0000-0000-000000000002', 'Video schneiden (wenn Dreh)', '3 Versionen schneiden: 15s, 30s, 60s', 'manual', 5, true);

-- Phase 3: Content (AI-generated)
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000003', 'Content erstellen', 'Texte und Skripte generieren, reviewen und freigeben lassen', 3, 2);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval, ai_content_type) VALUES
  ('a1000000-0000-0000-0000-000000000003', 'Ad Copys generieren', '5 Varianten: Emotional, Rational, Social Proof, Dringlichkeit, Frage. Je Hook + Haupttext + CTA', 'ai_generate', 1, true, 'ad_copy'),
  ('a1000000-0000-0000-0000-000000000003', 'Indeed Stellenanzeige schreiben', 'Titel, Beschreibung, Anforderungen, Benefits für Indeed', 'ai_generate', 2, true, 'job_posting'),
  ('a1000000-0000-0000-0000-000000000003', 'Erstansprache-Skript erstellen', 'Telefonskript: Begrüßung, Qualifizierung, Pitch, Einwandbehandlung, Abschluss', 'ai_generate', 3, true, 'phone_script'),
  ('a1000000-0000-0000-0000-000000000003', 'Follow-Up-Skript erstellen', 'Skript für nicht erreichbare Bewerber', 'ai_generate', 4, true, 'phone_script'),
  ('a1000000-0000-0000-0000-000000000003', 'Absage-Skript erstellen', 'Höfliches Absage-Skript', 'ai_generate', 5, false, 'phone_script'),
  ('a1000000-0000-0000-0000-000000000003', 'Videodreh-Skript schreiben (wenn Dreh)', 'Skript mit Hook, Problem, Lösung, CTA', 'ai_generate', 6, true, 'video_script'),
  ('a1000000-0000-0000-0000-000000000003', 'Funnel-Texte generieren', 'Headline, Subheadline, Benefits, FAQ, CTA für Perspective Funnel', 'ai_generate', 7, true, 'funnel_text');

-- Phase 4: Funnel bauen
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000004', 'Funnel bauen', 'Perspective Funnel erstellen, branden und testen', 4, 2);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval) VALUES
  ('a1000000-0000-0000-0000-000000000004', 'Perspective Funnel aus Template erstellen', 'Passende Vorlage wählen und duplizieren', 'manual', 1, false),
  ('a1000000-0000-0000-0000-000000000004', 'Branding im Funnel anpassen', 'Logo, Farben, Bilder einsetzen', 'manual', 2, false),
  ('a1000000-0000-0000-0000-000000000004', 'Texte im Funnel einsetzen', 'Genehmigte Funnel-Texte aus Library einpflegen', 'manual', 3, false),
  ('a1000000-0000-0000-0000-000000000004', 'Formular-Felder definieren', 'Name, Telefon, E-Mail, Erfahrung, Startdatum', 'manual', 4, false),
  ('a1000000-0000-0000-0000-000000000004', 'Danke-Seite einrichten', 'Bestätigungsseite nach Bewerbung', 'manual', 5, false),
  ('a1000000-0000-0000-0000-000000000004', 'Meta Pixel auf Funnel installieren', 'Pixel-Code einbetten und Conversion-Events verknüpfen', 'manual', 6, false),
  ('a1000000-0000-0000-0000-000000000004', 'Tracking testen', 'Test-Bewerbung durchführen, Pixel-Events prüfen', 'manual', 7, false),
  ('a1000000-0000-0000-0000-000000000004', 'Funnel-Domain zuweisen', 'jobs.kundenname.de oder Subdomain einrichten, SSL prüfen', 'manual', 8, false),
  ('a1000000-0000-0000-0000-000000000004', 'Funnel finalisieren', 'Letzte Prüfung und Freigabe durch Kunden', 'manual', 9, true);

-- Phase 5: Kampagne starten
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000005', 'Kampagne starten', 'Meta Ads Kampagne aufsetzen und starten', 5, 2);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval) VALUES
  ('a1000000-0000-0000-0000-000000000005', 'Kampagne erstellen', 'Conversion-Kampagne anlegen (Ziel: Leads)', 'manual', 1, false),
  ('a1000000-0000-0000-0000-000000000005', 'Zielgruppe definieren', 'Alter, Region, Interessen festlegen. 2-3 Ad Set Varianten', 'manual', 2, false),
  ('a1000000-0000-0000-0000-000000000005', 'Ads einpflegen', 'Genehmigte Creatives + Copys aus Library verknüpfen', 'manual', 3, false),
  ('a1000000-0000-0000-0000-000000000005', 'Budget festlegen', 'Tagesbudget mit Kunden abstimmen', 'manual', 4, true),
  ('a1000000-0000-0000-0000-000000000005', 'Tracking final prüfen', 'Pixel-Events, Conversion-Tracking verifizieren', 'manual', 5, false),
  ('a1000000-0000-0000-0000-000000000005', 'Indeed Anzeige veröffentlichen', 'Genehmigte Stellenanzeige live schalten', 'manual', 6, false),
  ('a1000000-0000-0000-0000-000000000005', 'Kampagne starten', 'Meta Kampagne aktivieren', 'manual', 7, true);

-- Phase 6: Laufende Betreuung (recurring)
INSERT INTO sop_phases (id, title, description, sort_order, estimated_days) VALUES
  ('a1000000-0000-0000-0000-000000000006', 'Laufende Betreuung', 'Wöchentliche Optimierung und Kunden-Check-ins', 6, 0);

INSERT INTO sop_tasks (phase_id, title, description, task_type, sort_order, requires_approval) VALUES
  ('a1000000-0000-0000-0000-000000000006', 'Wöchentlicher Performance-Check', 'KPIs prüfen: CPL, CTR, Conversion Rate. Underperformer pausieren', 'manual', 1, false),
  ('a1000000-0000-0000-0000-000000000006', 'Pipeline-Check', 'Bewerber-Status prüfen, Kunden bei Inaktivität erinnern', 'manual', 2, false),
  ('a1000000-0000-0000-0000-000000000006', 'Neue Ad-Varianten testen', 'A/B Tests mit neuen Copys und Creatives', 'manual', 3, false),
  ('a1000000-0000-0000-0000-000000000006', 'Monatliches Kunden-Feedback', 'Zufriedenheitsumfrage senden und auswerten', 'manual', 4, false);
