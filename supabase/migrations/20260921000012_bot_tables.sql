-- Phase 3: KI-Vorqualifizierungsbot — bot_configs, bot_questions, ai_calls (Spec §4, §8)

-- 1. bot_configs (P3-R2: Link läuft über jobs.bot_config_id, keine job_id hier)
CREATE TABLE bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  persona text NOT NULL DEFAULT 'Alex',
  tone text NOT NULL DEFAULT 'freundlich und locker',
  formality text NOT NULL DEFAULT 'du' CHECK (formality IN ('du','sie')),
  language text NOT NULL DEFAULT 'de',
  allowed_languages text[] NOT NULL DEFAULT '{de}',
  intro_text text,
  faq jsonb NOT NULL DEFAULT '[]',
  max_turns int NOT NULL DEFAULT 20,
  handover_rules jsonb NOT NULL DEFAULT '{}',
  scoring_rules jsonb NOT NULL DEFAULT '{"a_min": 75, "b_min": 50}',
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_configs select" ON bot_configs FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "bot_configs write" ON bot_configs FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 2. bot_questions
CREATE TABLE bot_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  bot_config_id uuid NOT NULL REFERENCES bot_configs(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  key text NOT NULL,
  text text NOT NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','choice','yes_no','date')),
  options jsonb,
  required boolean NOT NULL DEFAULT true,
  knockout_rule jsonb,
  weight int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_config_id, key)
);
CREATE INDEX idx_bot_questions_config ON bot_questions(bot_config_id, position);
ALTER TABLE bot_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_questions select" ON bot_questions FOR SELECT USING (can_access_agency(agency_id));
CREATE POLICY "bot_questions write" ON bot_questions FOR ALL USING (can_write_agency(agency_id)) WITH CHECK (can_write_agency(agency_id));

-- 3. ai_calls (Schreiben nur via Service-Role, Lesen für Mandanten)
CREATE TABLE ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_calls_agency_created ON ai_calls(agency_id, created_at DESC);
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_calls select" ON ai_calls FOR SELECT USING (can_access_agency(agency_id));

-- 4. FK jobs.bot_config_id (Spalte existiert seit 20260921000002)
ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_bot_config
  FOREIGN KEY (bot_config_id) REFERENCES bot_configs(id) ON DELETE SET NULL;

-- 5. Bot-Laufzeitzustand an der Conversation (Nachfrage-Zähler, Turns, Low-Confidence-Zähler)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_meta jsonb NOT NULL DEFAULT '{}';
