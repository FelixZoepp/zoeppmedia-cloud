-- Sicherheits-Fixes aus dem Review vom 2026-10-08

-- 1) Nutzer durften ihre eigene Zeile komplett ändern (inkl. role, agency_id, funktion, aktiv).
--    Aus dem Browser wird nur last_login geschrieben, alles andere läuft über die API (Service-Role).
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.users FROM authenticated;
GRANT UPDATE (last_login) ON public.users TO authenticated;

-- 2) Deaktivierte Nutzer verlieren den Zugriff auf Kundendaten.
CREATE OR REPLACE FUNCTION public.can_access_agency(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND coalesce(aktiv, true)
      AND (agency_id = target OR role IN ('admin', 'employee'))
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments ea JOIN users u ON u.id = ea.employee_id
    WHERE ea.employee_id = auth.uid() AND ea.agency_id = target AND coalesce(u.aktiv, true)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_write_agency(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND coalesce(aktiv, true) AND (
      (agency_id = target AND role IN ('agency_owner', 'agency_member'))
      OR role IN ('admin', 'employee')
    )
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments ea JOIN users u ON u.id = ea.employee_id
    WHERE ea.employee_id = auth.uid() AND ea.agency_id = target AND coalesce(u.aktiv, true)
  );
$function$;

-- 3) Alte Schreib-Policies erlaubten auch agency_viewer das Schreiben/Löschen.
--    Ersetzt durch "Kunden-Cloud schreiben" (can_write_agency).
DROP POLICY IF EXISTS "candidates insert" ON public.candidates;
DROP POLICY IF EXISTS "candidates update" ON public.candidates;
DROP POLICY IF EXISTS "candidates delete" ON public.candidates;
DROP POLICY IF EXISTS "Internal users can update candidates" ON public.candidates;
DROP POLICY IF EXISTS "candidate_stages insert" ON public.candidate_stages;
DROP POLICY IF EXISTS "notes insert" ON public.notes;

-- 4) View umging RLS (lief mit Rechten des Eigentümers) und war für anon lesbar.
ALTER VIEW IF EXISTS public.ttfc_stats SET (security_invoker = true);
REVOKE ALL ON public.ttfc_stats FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ttfc_stats FROM authenticated;
