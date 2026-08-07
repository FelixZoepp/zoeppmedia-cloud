-- Fix infinite recursion in users RLS policy
-- The old policy queried `users` from within a policy ON `users`, causing recursion.
-- Solution: use a SECURITY DEFINER function to bypass RLS when checking roles.

-- 1. Create helper function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM users WHERE id = user_id;
$$;

-- 2. Fix users SELECT policy
DROP POLICY IF EXISTS "Users can read relevant data" ON users;

CREATE POLICY "Users can read own row" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Internal users can read all users" ON users
  FOR SELECT USING (
    public.get_user_role(auth.uid()) IN ('admin', 'employee')
  );

-- 3. Fix candidates SELECT policy
DROP POLICY IF EXISTS "Users can read candidates" ON candidates;

CREATE POLICY "Users can read candidates" ON candidates
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR public.get_user_role(auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM employee_assignments
      WHERE employee_id = auth.uid()
      AND employee_assignments.agency_id = candidates.agency_id
    )
  );

-- 4. Fix agencies SELECT policy
DROP POLICY IF EXISTS "Users can read agencies" ON agencies;

CREATE POLICY "Users can read agencies" ON agencies
  FOR SELECT USING (
    id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR public.get_user_role(auth.uid()) IN ('admin', 'employee')
  );
