-- Phase 0 / Spec Abschn. 4: Jobs + Applications (Modell A aus Integrations-Design).
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  location text,
  postal_code text,
  employment_type text,
  salary_range text,
  contact_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','closed')),
  external_ref text,
  indeed_enabled boolean NOT NULL DEFAULT false,
  indeed_mode text NOT NULL DEFAULT 'off' CHECK (indeed_mode IN ('apply','redirect','off')),
  apply_url text,
  bot_config_id uuid, -- FK folgt in Phase 3 (bot_configs)
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, slug)
);
CREATE INDEX idx_jobs_agency_status ON jobs(agency_id, status);
CREATE UNIQUE INDEX uq_jobs_default_per_agency ON jobs(agency_id) WHERE is_default;

CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

-- Pipeline-Stufen bekommen festen Typ fürs Reporting (Spec Abschn. 10).
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS stage_type text
  CHECK (stage_type IN ('new','qualifying','qualified','interview','offer','hired','rejected'));
UPDATE pipeline_stages SET stage_type = CASE
  WHEN lower(name) LIKE '%eingang%' OR lower(name) LIKE '%neu%' THEN 'new'
  WHEN lower(name) LIKE '%kontakt%' THEN 'qualifying'
  WHEN lower(name) LIKE '%vorstellung%' OR lower(name) LIKE '%gespräch%' OR lower(name) LIKE '%termin%' THEN 'interview'
  WHEN lower(name) LIKE '%probetag%' THEN 'offer'
  WHEN lower(name) LIKE '%eingestellt%' THEN 'hired'
  WHEN lower(name) LIKE '%abgesagt%' OR lower(name) LIKE '%abgelehnt%' THEN 'rejected'
  ELSE 'qualifying'
END WHERE stage_type IS NULL;

-- Kandidaten = Person (Spec Abschn. 4); Bewerbung wandert in applications.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS consent_source text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'de';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE candidates SET phone_e164 = CASE
  WHEN phone IS NULL OR phone = '' THEN NULL
  WHEN regexp_replace(phone, '[^0-9+]', '', 'g') LIKE '+%'
    THEN regexp_replace(phone, '[^0-9+]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '00%'
    THEN '+' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 3)
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '0%'
    THEN '+49' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
  ELSE NULL
END WHERE phone_e164 IS NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_phone_e164 ON candidates(agency_id, phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  campaign jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','hired','rejected','withdrawn','not_reached')),
  score int,
  score_label text CHECK (score_label IN ('A','B','C')),
  score_reasons jsonb,
  summary text,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_applications_source_ref ON applications(agency_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX idx_applications_agency_stage ON applications(agency_id, stage_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_applications_job ON applications(job_id);

CREATE TABLE application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  question_text text,
  answer_raw text,
  answer_normalized jsonb,
  origin text NOT NULL DEFAULT 'bot' CHECK (origin IN ('indeed','bot','form')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, question_key)
);
CREATE INDEX idx_application_answers_app ON application_answers(application_id);

-- RLS: einheitlich über die Helper aus 20260921000001.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs select" ON jobs FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "jobs write" ON jobs FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_assignments select" ON job_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_access_agency(j.agency_id)));
CREATE POLICY "job_assignments write" ON job_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_write_agency(j.agency_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_id AND can_write_agency(j.agency_id)));

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications select" ON applications FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "applications write" ON applications FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "application_answers select" ON application_answers FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "application_answers write" ON application_answers FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));
