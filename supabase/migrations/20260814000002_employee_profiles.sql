-- Employee invite tokens (separate from agency invites)
CREATE TABLE IF NOT EXISTS employee_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  redeemed BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE employee_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage employee_invites" ON employee_invites FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Add profile fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS calendly_link TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
