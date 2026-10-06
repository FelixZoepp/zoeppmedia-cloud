-- Sicherheit: offene „Service …“-Policies entfernen.
--
-- Viele Tabellen hatten zusätzlich zu ihren eigentlichen Regeln eine Policy
--   FOR ALL TO public USING (true) WITH CHECK (true)
-- gedacht für den Service-Role-Client. Der umgeht RLS aber ohnehin – die Policy galt
-- daher für JEDEN (auch nicht eingeloggt mit dem öffentlichen Anon-Key) und hat die
-- eigentlichen Regeln (Agentur sieht nur eigene Daten, intern sieht alles) ausgehebelt.
--
-- Rückweg (falls nötig): CREATE POLICY "<name>" ON <tabelle> FOR ALL USING (true) WITH CHECK (true);

-- 1. Alle offenen FOR-ALL-Policies entfernen
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'ALL' AND qual = 'true' AND coalesce(with_check, 'true') = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Hilfsfunktion: interner Nutzer (Admin oder Mitarbeiter)
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'employee'));
$$;

-- 2. Lücken schließen, die bisher nur über die offene Policy liefen (intern darf weiter alles)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'masterclass_nudges', 'automation_runs', 'audit_log', 'health_checks', 'integration_logs',
    'consent_events', 'task_sla', 'video_views', 'billing_plans', 'billing_runs', 'mandates',
    'noshow_events', 'notifications'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Intern verwaltet" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Intern verwaltet" ON public.%I FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user())',
      t
    );
  END LOOP;
END $$;

-- Benachrichtigungen: Kunden dürfen Hinweise für ihr eigenes Konto/ihre Agentur anlegen
DROP POLICY IF EXISTS "Eigene Benachrichtigungen anlegen" ON public.notifications;
CREATE POLICY "Eigene Benachrichtigungen anlegen" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (agency_id IS NOT NULL AND public.can_access_agency(agency_id)));

-- Vorlagen-Tabellen: für eingeloggte Nutzer lesbar
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['access_item_templates', 'paket_definitionen', 'recruiting_pipeline_templates', 'task_templates', 'transcript_questions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Eingeloggt lesen" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Eingeloggt lesen" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- 3. Insert-für-jeden-Policies nur noch für eingeloggte Nutzer
DROP POLICY IF EXISTS "Anyone can insert activity" ON public.activity_log;
CREATE POLICY "Eingeloggt protokolliert Aktivität" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user() OR (agency_id IS NOT NULL AND public.can_access_agency(agency_id)));

DROP POLICY IF EXISTS "Anyone can insert login" ON public.login_history;
CREATE POLICY "Eigenen Login protokollieren" ON public.login_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- wird nur vom Webhook mit Service-Role geschrieben
DROP POLICY IF EXISTS "Service can insert email log" ON public.inbound_email_log;

-- 4. Inhalte nicht mehr ohne Login lesbar
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true' AND roles::text = '{public}'
      AND tablename IN ('lesson_tasks', 'masterclass_lessons', 'masterclass_modules', 'sop_phases', 'sop_tasks', 'survey_templates')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;
