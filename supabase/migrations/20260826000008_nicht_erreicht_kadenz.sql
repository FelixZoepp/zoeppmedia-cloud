-- Nicht-Erreicht-Kadenz: cadence tracking per candidate

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cadence_active BOOLEAN DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cadence_attempt INTEGER DEFAULT 0;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cadence_next_at TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cadence_next_window TEXT CHECK (cadence_next_window IN ('morning', 'afternoon', 'evening'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS preferred_call_window TEXT CHECK (preferred_call_window IN ('morning', 'afternoon', 'evening'));
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cadence_stopped_reason TEXT;

-- Index for cron job: find candidates due for next cadence call
CREATE INDEX IF NOT EXISTS idx_candidates_cadence_active ON candidates(cadence_active, cadence_next_at)
  WHERE cadence_active = true;
