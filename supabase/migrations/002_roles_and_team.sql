-- Phase 1: Update role system from text to enum, add team_members table

-- 1. Create role enum
CREATE TYPE user_role AS ENUM ('admin', 'employee', 'agency_owner', 'agency_member');

-- 2. Migrate existing role column
ALTER TABLE users ALTER COLUMN role TYPE user_role USING
  CASE
    WHEN role = 'admin' THEN 'admin'::user_role
    WHEN role = 'owner' THEN 'agency_owner'::user_role
    ELSE 'agency_owner'::user_role
  END;

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'agency_owner'::user_role;

-- 3. Team members table (for Zoepp Media internal employees)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 4. Add agency assignment for employees (which agencies they manage)
CREATE TABLE employee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, agency_id)
);

-- 5. RLS for team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Employees can read own record"
  ON team_members FOR SELECT
  USING (user_id = auth.uid());

-- 6. RLS for employee_assignments
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignments"
  ON employee_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Employees can read own assignments"
  ON employee_assignments FOR SELECT
  USING (employee_id = auth.uid());

-- 7. Update users RLS - allow admins and employees to read agency users
DROP POLICY IF EXISTS "Users can read own data" ON users;

CREATE POLICY "Users can read relevant data"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'employee')
    )
  );

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- 8. Update candidates RLS - allow admins and assigned employees to read
DROP POLICY IF EXISTS "Users can read own agency candidates" ON candidates;

CREATE POLICY "Users can read candidates"
  ON candidates FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM employee_assignments WHERE employee_id = auth.uid() AND employee_assignments.agency_id = candidates.agency_id
    )
  );

-- 9. Update agencies RLS - admins and employees see all/assigned
DROP POLICY IF EXISTS "Users can read own agency" ON agencies;

CREATE POLICY "Users can read agencies"
  ON agencies FOR SELECT
  USING (
    id IN (SELECT agency_id FROM users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM employee_assignments WHERE employee_id = auth.uid() AND employee_assignments.agency_id = agencies.id)
  );

-- 10. Index for performance
CREATE INDEX idx_employee_assignments_employee ON employee_assignments(employee_id);
CREATE INDEX idx_employee_assignments_agency ON employee_assignments(agency_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_users_role ON users(role);
