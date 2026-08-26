-- Add budget columns to onboarding_submissions
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS meta_daily_budget numeric,
  ADD COLUMN IF NOT EXISTS indeed_daily_budget numeric;

-- Extend meta_access_steps JSONB with Indeed step fields
-- Existing rows get the new keys via application code (JSONB is flexible)
-- No schema change needed for JSONB — the client sends the full object
