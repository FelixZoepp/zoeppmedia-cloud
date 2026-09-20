-- Phase 0 / Spec Abschn. 2+4: Mandanten-Felder, Viewer-Rolle, RLS-Helper.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agency_viewer';

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Berlin';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS retention_days int NOT NULL DEFAULT 180;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

UPDATE agencies SET slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';
UPDATE agencies a SET slug = a.slug || '-' || substr(a.id::text, 1, 4)
WHERE EXISTS (SELECT 1 FROM agencies b WHERE b.slug = a.slug AND b.id < a.id);
ALTER TABLE agencies ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agencies_slug ON agencies(slug);

CREATE OR REPLACE FUNCTION public.can_access_agency(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND (agency_id = target OR role IN ('admin', 'employee'))
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments
    WHERE employee_id = auth.uid() AND agency_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_agency(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND (
      (agency_id = target AND role IN ('agency_owner', 'agency_member'))
      OR role IN ('admin', 'employee')
    )
  ) OR EXISTS (
    SELECT 1 FROM employee_assignments
    WHERE employee_id = auth.uid() AND agency_id = target
  );
$$;
