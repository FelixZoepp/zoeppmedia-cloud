-- Pipeline Templates (the master definition)
CREATE TABLE recruiting_pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  aktiv BOOLEAN DEFAULT true,
  definition_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recruiting_pipeline_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal reads templates" ON recruiting_pipeline_templates FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Admin manages templates" ON recruiting_pipeline_templates FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Service manages templates" ON recruiting_pipeline_templates FOR ALL
  USING (true) WITH CHECK (true);

-- Per-client pipeline instance
CREATE TABLE recruiting_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES recruiting_pipeline_templates(id),
  template_version INTEGER NOT NULL DEFAULT 1,
  aktiv BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agency_id)
);

ALTER TABLE recruiting_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency sees own pipeline" ON recruiting_pipelines FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal manages pipelines" ON recruiting_pipelines FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages pipelines" ON recruiting_pipelines FOR ALL
  USING (true) WITH CHECK (true);

-- Pipeline stages per client
CREATE TABLE recruiting_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES recruiting_pipelines(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  reihenfolge INTEGER NOT NULL,
  sla_stunden NUMERIC,
  sla_minuten NUMERIC,
  owner_rolle TEXT CHECK (owner_rolle IN ('system', 'kunde', 'ops')),
  gate_bedingung TEXT,
  aktiv BOOLEAN DEFAULT true,
  pflicht BOOLEAN DEFAULT true,
  config_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruiting_stages_pipeline ON recruiting_stages(pipeline_id);
ALTER TABLE recruiting_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency sees own stages" ON recruiting_stages FOR SELECT
  USING (pipeline_id IN (SELECT id FROM recruiting_pipelines WHERE agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Internal manages stages" ON recruiting_stages FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages stages" ON recruiting_stages FOR ALL
  USING (true) WITH CHECK (true);

-- Stage transition events (the audit trail)
CREATE TABLE candidate_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  von_stage TEXT,
  nach_stage TEXT NOT NULL,
  zeitpunkt TIMESTAMPTZ NOT NULL DEFAULT now(),
  ausgeloest_von UUID REFERENCES users(id),
  notiz TEXT
);

CREATE INDEX idx_candidate_stage_events_candidate ON candidate_stage_events(candidate_id);
CREATE INDEX idx_candidate_stage_events_zeit ON candidate_stage_events(zeitpunkt);
ALTER TABLE candidate_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency sees own events" ON candidate_stage_events FOR SELECT
  USING (candidate_id IN (SELECT id FROM candidates WHERE agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Internal manages events" ON candidate_stage_events FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages events" ON candidate_stage_events FOR ALL
  USING (true) WITH CHECK (true);

-- Stage assets (scripts, videos, templates per stage)
CREATE TABLE stage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('skript', 'video', 'vorlage', 'checkliste')),
  titel TEXT NOT NULL,
  url TEXT,
  inhalt TEXT,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_assets_stage ON stage_assets(stage_key);
ALTER TABLE stage_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency sees own and global assets" ON stage_assets FOR SELECT
  USING (agency_id IS NULL OR agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal manages assets" ON stage_assets FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service manages assets" ON stage_assets FOR ALL
  USING (true) WITH CHECK (true);

-- Extend candidates with recruiting-specific fields
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recruiting_stage_key TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS recruiting_status TEXT DEFAULT 'aktiv' CHECK (recruiting_status IN ('aktiv', 'abgelehnt', 'abgesprungen', 'eingestellt'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS ablehngrund TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS vorquali_json JSONB;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS kosten_zugeordnet NUMERIC(10,2);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS erster_kontaktversuch_am TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS eingestellt_am TIMESTAMPTZ;
