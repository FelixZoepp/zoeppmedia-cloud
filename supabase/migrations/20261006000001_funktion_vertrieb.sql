-- Neue Sales-Bereiche „vertrieb“ (Vertriebsleitung), „setter“ und „closer“ für users und employee_invites.
-- Die bisherigen Check-Constraints haben automatisch vergebene Namen → per Katalog suchen und ersetzen.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.users'::regclass, 'public.employee_invites'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%media_buyer%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE users ADD CONSTRAINT users_funktion_check
  CHECK (funktion IS NULL OR funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice', 'vertrieb', 'setter', 'closer'));
ALTER TABLE employee_invites ADD CONSTRAINT employee_invites_funktion_check
  CHECK (funktion IS NULL OR funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice', 'vertrieb', 'setter', 'closer'));
