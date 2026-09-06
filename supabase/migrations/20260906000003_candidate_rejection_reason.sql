-- Absagegrund am Bewerber speichern (Kanban-Modal sendet ihn bereits)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
