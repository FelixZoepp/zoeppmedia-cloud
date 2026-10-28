-- Sicherheit: Lebensläufe und Anrufaufnahmen nur noch über den Server (Service-Role, signierte Links).
-- Die alten Regeln prüften nur den Bucket, nicht die Agentur → jeder eingeloggte Nutzer konnte alle Dateien lesen,
-- Hochladen in candidate-resumes ging sogar ohne Login.
drop policy if exists "Internal users can read candidate-resumes" on storage.objects;
drop policy if exists "Service can upload candidate-resumes" on storage.objects;
drop policy if exists "Authenticated users can read call-recordings" on storage.objects;
drop policy if exists "Authenticated users can upload call-recordings" on storage.objects;

-- Deaktivierte Mitarbeiter verlieren ihre Datenbankrechte sofort
create or replace function public.is_internal_user()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (select 1 from users where id = auth.uid() and role in ('admin', 'employee') and coalesce(aktiv, true));
$$;

-- Viele ältere Policies prüfen die Rolle über get_user_role → deaktivierte Nutzer haben keine Rolle mehr
create or replace function public.get_user_role(user_id uuid)
returns user_role
language sql
stable security definer
set search_path to 'public'
as $$
  select role from users where id = user_id and coalesce(aktiv, true);
$$;
