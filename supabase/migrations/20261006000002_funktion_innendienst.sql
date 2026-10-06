-- Neuer Bereich „innendienst“: bearbeitet Bewerber direkt in den Kunden-Clouds
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_funktion_check;
ALTER TABLE users ADD CONSTRAINT users_funktion_check
  CHECK (funktion IS NULL OR funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice', 'vertrieb', 'setter', 'closer', 'innendienst'));
ALTER TABLE employee_invites DROP CONSTRAINT IF EXISTS employee_invites_funktion_check;
ALTER TABLE employee_invites ADD CONSTRAINT employee_invites_funktion_check
  CHECK (funktion IS NULL OR funktion IN ('ops', 'content', 'media_buyer', 'csm', 'backoffice', 'vertrieb', 'setter', 'closer', 'innendienst'));
