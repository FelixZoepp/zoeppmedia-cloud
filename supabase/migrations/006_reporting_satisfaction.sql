-- Phase 5: Reporting + Satisfaction surveys

-- 1. Survey templates
CREATE TABLE survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Survey responses
CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  answers JSONB DEFAULT '{}'::jsonb,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Meta ad reports (skeleton for future API)
CREATE TABLE meta_ad_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  spend DECIMAL(10,2),
  impressions INTEGER,
  clicks INTEGER,
  leads INTEGER,
  cpl DECIMAL(10,2),
  ctr DECIMAL(5,4),
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agency_id, report_date)
);

-- 4. Report snapshots (cached aggregate data)
CREATE TABLE report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. RLS
ALTER TABLE survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

-- Templates: public read, admin write
CREATE POLICY "Anyone can read templates" ON survey_templates FOR SELECT USING (true);
CREATE POLICY "Admins manage templates" ON survey_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Responses: agency users create own, admins read all
CREATE POLICY "Agency users create responses" ON survey_responses
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    AND user_id = auth.uid()
  );
CREATE POLICY "Users read own responses" ON survey_responses
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );

-- Meta reports: admins manage, agency users read own
CREATE POLICY "Internal manage meta reports" ON meta_ad_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );
CREATE POLICY "Agency users read own meta reports" ON meta_ad_reports
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Report snapshots: same as meta
CREATE POLICY "Internal manage snapshots" ON report_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'))
  );
CREATE POLICY "Agency users read own snapshots" ON report_snapshots
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- 6. Indexes
CREATE INDEX idx_survey_responses_agency ON survey_responses(agency_id);
CREATE INDEX idx_survey_responses_template ON survey_responses(template_id);
CREATE INDEX idx_meta_reports_agency ON meta_ad_reports(agency_id);
CREATE INDEX idx_meta_reports_date ON meta_ad_reports(report_date);
CREATE INDEX idx_report_snapshots_agency ON report_snapshots(agency_id);

-- 7. Seed a default survey template
INSERT INTO survey_templates (title, description, questions) VALUES (
  'Kundenzufriedenheit',
  'Wie zufrieden bist du mit unserer Zusammenarbeit?',
  '[
    {"id": "overall", "type": "rating", "label": "Gesamtzufriedenheit (1-5 Sterne)"},
    {"id": "communication", "type": "rating", "label": "Kommunikation"},
    {"id": "quality", "type": "rating", "label": "Qualität der Kampagnen"},
    {"id": "recommend", "type": "rating", "label": "Würdest du uns weiterempfehlen?"}
  ]'
);
