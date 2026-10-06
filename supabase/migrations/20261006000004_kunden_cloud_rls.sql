-- Kunden-Cloud: Kunde (owner/member) und Innendienst arbeiten in derselben Cloud.
-- Ältere Recruiting-Tabellen erlaubten Mitarbeitern nur mit fester employee_assignments-Zuordnung
-- bzw. Kunden nur über users.agency_id. Neue Regeln nach dem Muster der neueren Tabellen
-- (applications, conversations, …): lesen = can_access_agency, schreiben = can_write_agency.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidates', 'call_logs', 'candidate_appointments', 'noshow_events', 'consent_events', 'calendly_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Kunden-Cloud lesen" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Kunden-Cloud lesen" ON public.%I FOR SELECT TO authenticated USING (public.can_access_agency(agency_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Kunden-Cloud schreiben" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Kunden-Cloud schreiben" ON public.%I FOR ALL TO authenticated USING (public.can_write_agency(agency_id)) WITH CHECK (public.can_write_agency(agency_id))',
      t
    );
  END LOOP;
END $$;

-- Tabellen ohne agency_id: über den Bewerber
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notes', 'candidate_stages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Kunden-Cloud lesen" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Kunden-Cloud lesen" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND public.can_access_agency(c.agency_id)))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "Kunden-Cloud schreiben" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Kunden-Cloud schreiben" ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND public.can_write_agency(c.agency_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND public.can_write_agency(c.agency_id)))',
      t
    );
  END LOOP;
END $$;
