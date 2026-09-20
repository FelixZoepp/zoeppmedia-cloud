-- ============================================================
-- 1. Web Push Subscriptions
-- ============================================================
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service can manage push subscriptions" ON push_subscriptions FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Termine (Vorstellungsgespräch / Probetag) mit Erinnerungs-Call
-- ============================================================
CREATE TABLE candidate_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vorstellungsgespraech', 'probetag')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'erschienen', 'no_show', 'abgesagt')),
  reminder_done_at TIMESTAMPTZ,
  reminder_by UUID REFERENCES users(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cand_appts_candidate ON candidate_appointments(candidate_id);
CREATE INDEX idx_cand_appts_agency ON candidate_appointments(agency_id);
CREATE INDEX idx_cand_appts_due ON candidate_appointments(scheduled_at) WHERE status = 'geplant' AND reminder_done_at IS NULL;
ALTER TABLE candidate_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own appointments" ON candidate_appointments FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Agency users insert appointments" ON candidate_appointments FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Agency users update own appointments" ON candidate_appointments FOR UPDATE
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users manage all appointments" ON candidate_appointments FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can manage appointments" ON candidate_appointments FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Call-Skripte pro Agentur
-- ============================================================
CREATE TABLE call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  script_type TEXT NOT NULL CHECK (script_type IN ('erstkontakt', 'erinnerung_vg', 'erinnerung_probetag')),
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, script_type)
);

CREATE INDEX idx_call_scripts_agency ON call_scripts(agency_id);
ALTER TABLE call_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users see own scripts" ON call_scripts FOR SELECT
  USING (agency_id = (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Internal users manage scripts" ON call_scripts FOR ALL
  USING (public.get_user_role(auth.uid()) IN ('admin', 'employee'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'employee'));
CREATE POLICY "Service can manage scripts" ON call_scripts FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Büro-Nummer pro Agentur (mit welcher Nummer gecallt wird)
-- ============================================================
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS outbound_phone TEXT;
