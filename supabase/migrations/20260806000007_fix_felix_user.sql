-- Allow admins/employees to have no agency
ALTER TABLE users ALTER COLUMN agency_id DROP NOT NULL;

-- Ensure Felix has a users row linked to his auth account
DELETE FROM users WHERE id = '0f578dce-1412-4f5f-9168-ad664f319e6f';

INSERT INTO users (id, email, name, role, agency_id)
VALUES (
  '0f578dce-1412-4f5f-9168-ad664f319e6f',
  'felix@zoeppmedia.de',
  'Felix',
  'admin',
  NULL
);
